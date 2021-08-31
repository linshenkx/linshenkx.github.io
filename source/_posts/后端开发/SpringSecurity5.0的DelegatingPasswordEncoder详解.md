---
title: SpringSecurity5.0的DelegatingPasswordEncoder详解
id: DelegatingPasswordEncoder
permalink: DelegatingPasswordEncoder/
date: 2018-05-07 14:30:32
categories: 后端开发
top: false
tags:
- Spring
---
本文参考自Spring Security 5.0.4.RELEASE  的官方文档,结合源码介绍了DelegatingPasswordEncoder,对其工作过程进行分析并解决其中遇到的问题.包括`There is no PasswordEncoder mapped for the id "null"`的非法参数异常的正确处理方法
<!-- more -->
##PasswordEncoder
首先要理解**DelegatingPasswordEncoder**的作用和存在意义,明白官方为什么要使用它来取代原先的**NoOpPasswordEncoder**

**DelegatingPasswordEncoder**和**NoOpPasswordEncoder**都是`PasswordEncoder`接口的实现类,根据官方的定义,Spring Security的**PasswordEncoder**接口用于执行密码的单向转换，以便安全地存储密码。

关于密码存储的演变历史这里我不多做介绍,简单来说就是现在数据库存储的密码基本都是经过编码的,而**决定如何编码**以及**判断未编码的字符序列和编码后的字符串是否匹配**就是PassswordEncoder的责任.

这里我们可以看一下PasswordEncoder接口的源码
```java
public interface PasswordEncoder {

	/**
	 * Encode the raw password. Generally, a good encoding algorithm applies a SHA-1 or
	 * greater hash combined with an 8-byte or greater randomly generated salt.
	 */
	String encode(CharSequence rawPassword);

	/**
	 * Verify the encoded password obtained from storage matches the submitted raw
	 * password after it too is encoded. Returns true if the passwords match, false if
	 * they do not. The stored password itself is never decoded.
	 *
	 * @param rawPassword the raw password to encode and match
	 * @param encodedPassword the encoded password from storage to compare with
	 * @return true if the raw password, after encoding, matches the encoded password from
	 * storage
	 */
	boolean matches(CharSequence rawPassword, String encodedPassword);

}
```
根据源码,我们可以直观地看到,PassswordEncoder接口只有两个方法,一个是`String encode(CharSequence rawPassword);`,用于将字符序列(即原密码)进行编码,另一个方法是`boolean matches(CharSequence rawPassword, String encodedPassword);`,用于比较字符序列和编码后的密码是否匹配.

理解了PasswordEncoder的作用后我们来Spring Security 5.0之前默认的PasswordEncoder实现类`NoOpPasswordEncoder`,这个类已经被标记为过时了,因为不安全,下面就让我们来看看它是如何地不安全的
### 1 NoOpPasswordEncoder
事实上,NoOpPasswordEncoder就是没有编码的编码器,源码如下:
```java
@Deprecated
public final class NoOpPasswordEncoder implements PasswordEncoder {

	public String encode(CharSequence rawPassword) {
		return rawPassword.toString();
	}

	public boolean matches(CharSequence rawPassword, String encodedPassword) {
		return rawPassword.toString().equals(encodedPassword);
	}

	/**
	 * Get the singleton {@link NoOpPasswordEncoder}.
	 */
	public static PasswordEncoder getInstance() {
		return INSTANCE;
	}

	private static final PasswordEncoder INSTANCE = new NoOpPasswordEncoder();

	private NoOpPasswordEncoder() {
	}

}
```
可以看到,**NoOpPasswordEncoder**的**encode**方法就只是简单地把字符序列转成字符串,也就是说,你输入的密码"123456"存储在数据库里仍然是"123456",这样如果数据库被攻破的话,密码就直接泄露了,十分不安全.而且,**NoOpPasswordEncoder**也就失去了所谓密码编码器的意义了.

不过,正因其十分简单,所以在Spring Security 5.0 之前**NoOpPasswordEncoder**是作为默认的密码编码器而存在到,它可以是你没有主动加密时的一个默认选择.

另外,**NoOpPasswordEncoder**的实现是一个标准的饿汉单例模式,关于单例模式可以看这一篇文章,[单例模式及其4种推荐写法和3类保护手段](https://blog.csdn.net/alinyua/article/details/79776613)

### 2 DelegatingPasswordEncoder
通过上面的学习,我们可以知道随着安全要求的提高,之前的默认密码编码器**NoOpPasswordEncoder**已经被"不推荐"了,那我们有理由推测现在的默认密码编码器换成了使用某一特定算法的编码器.可是这样便会带来三个问题:

- 有许多使用旧密码编码的应用程序无法轻松迁移
- 密码存储的最佳做法(算法)可能会再次发生变化
- 作为一个框架，Spring Security不能经常发生突变

简单来说,就是新的密码编码器和旧密码的兼容性,以及自身的稳健性以及需要一定的可变性(切换到更好的算法).听起来是不是十分矛盾?那我们就来看看**DelegatingPasswordEncoder**是怎么解决这个问题的,在看解决方法之前先看使用**DelegatingPasswordEncoder**所能达到的效果:

- 确保使用当前密码存储建议对密码进行编码
- 允许验证现代和传统格式的密码
- 允许将来升级编码算法

是不是很神奇?事实上**DelegatingPasswordEncoder**并不是传统意义上的编码器,它并不使用某一特定算法进行编码,顾名思义,它是一个**委派密码编码器**,它将具体编码的实现根据要求委派给不同的算法,以此来实现不同编码算法之间的兼容和变化协调.
#### 1 构造方法
下面我们来看看**DelegatingPasswordEncoder**的构造方法
```
	public DelegatingPasswordEncoder(String idForEncode,
		Map<String, PasswordEncoder> idToPasswordEncoder) {
		if(idForEncode == null) {
			throw new IllegalArgumentException("idForEncode cannot be null");
		}
		if(!idToPasswordEncoder.containsKey(idForEncode)) {
			throw new IllegalArgumentException("idForEncode " + idForEncode + "is not found in idToPasswordEncoder " + idToPasswordEncoder);
		}
		for(String id : idToPasswordEncoder.keySet()) {
			if(id == null) {
				continue;
			}
			if(id.contains(PREFIX)) {
				throw new IllegalArgumentException("id " + id + " cannot contain " + PREFIX);
			}
			if(id.contains(SUFFIX)) {
				throw new IllegalArgumentException("id " + id + " cannot contain " + SUFFIX);
			}
		}
		this.idForEncode = idForEncode;
		this.passwordEncoderForEncode = idToPasswordEncoder.get(idForEncode);
		this.idToPasswordEncoder = new HashMap<>(idToPasswordEncoder);
	}
```
**idForEncode**决定密码编码器的类型,**idToPasswordEncoder**决定判断匹配时兼容的类型
而且**idToPasswordEncoder**必须包含**idForEncode**(不然加密后就无法匹配了)

围绕这个构造方法通常有两种创建思路,如下:
##### 工厂构造
首先是工厂构造
```java
PasswordEncoder passwordEncoder =
    PasswordEncoderFactories.createDelegatingPasswordEncoder();
```
其具体实现如下:
```java
	public static PasswordEncoder createDelegatingPasswordEncoder() {
		String encodingId = "bcrypt";
		Map<String, PasswordEncoder> encoders = new HashMap<>();
		encoders.put(encodingId, new BCryptPasswordEncoder());
		encoders.put("ldap", new LdapShaPasswordEncoder());
		encoders.put("MD4", new Md4PasswordEncoder());
		encoders.put("MD5", new MessageDigestPasswordEncoder("MD5"));
		encoders.put("noop", NoOpPasswordEncoder.getInstance());
		encoders.put("pbkdf2", new Pbkdf2PasswordEncoder());
		encoders.put("scrypt", new SCryptPasswordEncoder());
		encoders.put("SHA-1", new MessageDigestPasswordEncoder("SHA-1"));
		encoders.put("SHA-256", new MessageDigestPasswordEncoder("SHA-256"));
		encoders.put("sha256", new StandardPasswordEncoder());

		return new DelegatingPasswordEncoder(encodingId, encoders);
	}
```
这个可以简单地理解为,遇到新密码,**DelegatingPasswordEncoder**会委托给**BCryptPasswordEncoder**(encodingId为*bcryp**)进行加密,同时,对历史上使用**ldap**,**MD4**,**MD5**等等加密算法的密码认证保持兼容(如果数据库里的密码使用的是**MD5**算法,那使用matches方法认证仍可以通过,但新密码会使**bcrypt**进行储存),十分神奇,原理后面会讲

#####  定制构造
接下来是定制构造,其实和工厂方法是一样的,一般情况下推荐直接使用工厂方法,这里给一个小例子
```java
String idForEncode = "bcrypt";
Map encoders = new HashMap<>();
encoders.put(idForEncode, new BCryptPasswordEncoder());
encoders.put("noop", NoOpPasswordEncoder.getInstance());
encoders.put("pbkdf2", new Pbkdf2PasswordEncoder());
encoders.put("scrypt", new SCryptPasswordEncoder());
encoders.put("sha256", new StandardPasswordEncoder());

PasswordEncoder passwordEncoder =
    new DelegatingPasswordEncoder(idForEncode, encoders);
```

#### 2 密码存储格式
密码的标准存储格式是:
>{id}encodedPassword

其中,**id**标识使用**PaswordEncoder**的种类
**encodedPassword**是原密码被编码后的密码

>注意:
>**rawPassword**,**encodedPassword**,**密码存储格式**(**prefixEncodedPassword**),这三者是不同的概念!
>`rawPassword`相当于字符序列"`123456`"
>`encodedPassword`是使用id为"mycrypt"对应的密码编码器"123456"编码后的字符串,假设为"`qwertyuiop`"
>`存储的密码 prefixEncodedPassword`是在数据库中,我们所能见到的形式,如"`{mycrypt}qwertyuiop`"
>这个概念在后面讲matches方法的源码时会用到,请留意

例如**rawPassword**为**password**在使用不同编码算法的情况下在数据库的存储如下:
```
{bcrypt}$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG 
{noop}password 
{pbkdf2}5d923b44a6d129f3ddf3e3c8d29412723dcbde72445e8ef6bf3b508fbf17fa4ed4d6b99ca763d8dc 
{scrypt}$e0801$8bWJaSu2IKSn9Z9kM+TPXfOc/9bdYSrN1oD9qfVThWEwdRTnO7re7Ei+fUZRJ68k9lTyuTeUp4of4g24hHnazw==$OAOec05+bXxvuu/1qZ6NUR+xQYvYv7BeL1QxwRpY5Pc=  
{sha256}97cde38028ad898ebc02e690819fa220e88c62e0699403e94fff291cfffaf8410849f27605abcbc0 
```
>这里需要指明,密码的可靠性并不依赖于加密算法的保密,即密码的可靠在于就算你知道我使用的是什么算法你也无法还原出原密码(当然,对于本身就可逆的编码算法来说就不是这样了,但这样的算法我们通常不会认为是可靠的),而且,即使没有标明使用的是什么算法,攻击者也很容易根据一些规律从编码后的密码字符串中推测出编码算法,如bcrypt算法通常是以`$2a$`开头的

#### 3 密码编码与匹配
从上文可知,**idForEncode**这个构造参数决定使用哪个PasswordEncoder进行密码的编码,编码的方法如下:
```java
	private static final String PREFIX = "{";
	private static final String SUFFIX = "}";

	@Override
	public String encode(CharSequence rawPassword) {
		return PREFIX + this.idForEncode + SUFFIX + this.passwordEncoderForEncode.encode(rawPassword);
	}
```
所以用上文构造的**DelegatingPasswordEncoder**默认使用**BCryptPasswordEncoder**,结果格式如
>{bcrypt}$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG

密码编码方法比较简单,重点在于匹配.匹配方法源码如下:
```java
	@Override
	public boolean matches(CharSequence rawPassword, String prefixEncodedPassword) {
		if(rawPassword == null && prefixEncodedPassword == null) {
			return true;
		}
		//取出编码算法的id
		String id = extractId(prefixEncodedPassword);
		//根据编码算法的id从支持的密码编码器Map(构造时传入)中取出对应编码器
		PasswordEncoder delegate = this.idToPasswordEncoder.get(id);
		if(delegate == null) {
		//如果找不到对应的密码编码器则使用默认密码编码器进行匹配判断,此时比较的密码字符串是 prefixEncodedPassword
			return this.defaultPasswordEncoderForMatches
				.matches(rawPassword, prefixEncodedPassword);
		}
		//从 prefixEncodedPassword 中提取获得 encodedPassword 
		String encodedPassword = extractEncodedPassword(prefixEncodedPassword);
		//使用对应编码器进行匹配判断,此时比较的密码字符串是 encodedPassword ,不携带编码算法id头
		return delegate.matches(rawPassword, encodedPassword);
	}
```
这个匹配方法其实也挺好理解的,唯一需要特别注意的就是找不到对应密码编码器时使用的默认密码编码器,

我们来看看**defaultPasswordEncoderForMatches**是一个什么东西
#### 4 defaultPasswordEncoderForMatches及 id为null异常
在**DelegatingPasswordEncoder**的源码里对应内容如下
```java
	private static final String PREFIX = "{";
	private static final String SUFFIX = "}";
	private final String idForEncode;
	private final PasswordEncoder passwordEncoderForEncode;
	private final Map<String, PasswordEncoder> idToPasswordEncoder;
	
	private PasswordEncoder defaultPasswordEncoderForMatches = new UnmappedIdPasswordEncoder();

	public void setDefaultPasswordEncoderForMatches(
		PasswordEncoder defaultPasswordEncoderForMatches) {
		if(defaultPasswordEncoderForMatches == null) {
			throw new IllegalArgumentException("defaultPasswordEncoderForMatches cannot be null");
		}
		this.defaultPasswordEncoderForMatches = defaultPasswordEncoderForMatches;
	}

	private class UnmappedIdPasswordEncoder implements PasswordEncoder {

		@Override
		public String encode(CharSequence rawPassword) {
			throw new UnsupportedOperationException("encode is not supported");
		}

		@Override
		public boolean matches(CharSequence rawPassword,
			String prefixEncodedPassword) {
			String id = extractId(prefixEncodedPassword);
			throw new IllegalArgumentException("There is no PasswordEncoder mapped for the id \"" + id + "\"");
		}
	}
```
可以看到,**DelegatingPasswordEncoder**里面,
**PREFIX **和**SUFFIX **是常量,
**idForEncode**,**passwordEncoderForEncode**和**idToPasswordEncoder**是在构造方法中传入决定并不可修改的,
只有**defaultPasswordEncoderForMatches **是有一个**setDefaultPasswordEncoderForMatches**方法进行设置的可变对象.

而且,它有一个私有的默认实现`UnmappedIdPasswordEncoder `,这个所谓的默认实现的唯一作用就是**抛出异常提醒你要自己选择一个默认密码编码器来取代它**,通常我们只会可能用到它的matches方法,这个时候就会报抛出如下异常
```java
java.lang.IllegalArgumentException: There is no PasswordEncoder mapped for the id "null"
	at org.springframework.security.crypto.password.DelegatingPasswordEncoder$UnmappedIdPasswordEncoder.matches(DelegatingPasswordEncoder.java:233)
	at org.springframework.security.crypto.password.DelegatingPasswordEncoder.matches(DelegatingPasswordEncoder.java:196)
```
#### 5 解决方法
遇到这个异常,最简单的做法就是明确提供一个**PasswordEncoder**对密码进行编码,如果是从Spring Security 5.0 之前迁移而来的,由于之前默认使用的是**NoOpPasswordEncoder**并且数据库的密码保存格式不带有加密算法id头,会报id为null异常,所以应该明确提供一个**NoOpPasswordEncoder**密码编码器.

这里有两种思路,其一就是使用**NoOpPasswordEncoder**取代**DelegatingPasswordEncoder**,以恢复到之前版本的状态,这也是笔者在其他博客上看得比较多的一种解决方法.另外就是使用**DelegatingPasswordEncoder**的`setDefaultPasswordEncoderForMatches`方法指定默认的密码编码器为**NoOpPasswordEncoder**,这两种方法孰优孰劣自然不言而喻,官方文档是这么说的
>Reverting to NoOpPasswordEncoder is not considered to be secure. You should instead migrate to using DelegatingPasswordEncoder to support secure password encoding.
恢复到NoOpPasswordEncoder不被认为是安全的。您应该转而使用DelegatingPasswordEncoder支持安全密码编码

当然,你也可以将数据库保存的密码都加上一个`{noop}`前缀,这样**DelegatingPasswordEncoder**就知道要使用**NoOpPasswordEncoder**了,这确实是一种方法,但没必要,这里我们来看一下前面的两种解决方法的实现
##### 1 使用NoOpPasswordEncoder取代DelegatingPasswordEncoder
```java
@Bean
 public  static NoOpPasswordEncoder passwordEncoder（）{
     return NoOpPasswordEncoder.getInstance（）;
}
```
##### 2 使用DelegatingPasswordEncoder指定defaultPasswordEncoderForMatches
```
    @Bean
    public  static PasswordEncoder passwordEncoder( ){
        DelegatingPasswordEncoder delegatingPasswordEncoder =
                (DelegatingPasswordEncoder) PasswordEncoderFactories.createDelegatingPasswordEncoder();
//设置defaultPasswordEncoderForMatches为NoOpPasswordEncoder
        delegatingPasswordEncoder.setDefaultPasswordEncoderForMatches(NoOpPasswordEncoder.getInstance());
        return  delegatingPasswordEncoder;
    }
```