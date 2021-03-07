---
title: 深入解析Spring使用枚举接收参数和返回值机制并提供自定义最佳实践
date: 2019-01-14 09:54:10
categories: 后端开发
top: true
tags:
- Spring
---
Spring对应枚举传参/返回值默认是用字面量实现的（实际情况更复杂），而《阿里巴巴Java开发手册》规定接口返回值不可以使用枚举类型（包括含枚举类型的POJO对象），为此，本文探究了Spring内部对枚举参数的传递和处理机制，并提供了一套自定义方案。
<!-- more -->
## 一 目标与思路
### 0 起因
《阿里巴巴Java开发手册》将接口中枚举的使用分为两类，即 接口参数和接口返回值，并规定：
**接口参数可以使用枚举类型，但接口返回值不可以使用枚举类型（包括含枚举类型的POJO对象）**。

知乎有相关讨论和作者亲答，详情可见：[Java枚举什么不好，《阿里巴巴JAVA开发手册》对于枚举规定的考量是什么？](https://www.zhihu.com/question/52760637)

现摘录一部分作者回答如下：

>> **由于升级原因，导致双方的枚举类不尽相同，在接口解析，类反序列化时出现异常**。
>
>> Java中出现的任何元素，在Gosling的角度都会有背后的思考和逻辑（尽管并非绝对完美，但Java的顶层抽象已经是天才级了），比如：接口、抽象类、注解、和本文提到的枚举。枚举有好处，类型安全，清晰直接，还可以使用等号来判断，也可以用在switch中。`它的劣势也是明显的，就是不要扩展`。可是为什么在返回值和参数进行了区分呢，如果不兼容，那么两个都有问题，怎么允许参数可以有枚举。当时的考虑，如果参数也不能用，那么枚举几乎无用武之地了。参数输出，毕竟是本地决定的，你本地有的，传送过去，向前兼容是不会有问题的。但如果是接口返回，就比较恶心了，因为解析回来的这个枚举值，可能本地还没有，这时就会抛出序列化异常。
>
>> 比如：你的本地枚举类，有一个天气Enum：SUNNY, RAINY, CLOUDY，如果根据天气计算心情的方法：guess(WeatcherEnum xx)，传入这三个值都是可以的。返回值：Weather guess(参数)，那么对方运算后，返回一个SNOWY，本地枚举里没有这个值，傻眼了。

当然，使用 code 照样不能处理，对此，开发手册作者的回答如下
>主要是从防止这种序列化异常角度来考虑，使用code至少不会出大乱子。而catch序列化异常，有点像catch(NullPointerException e)一样代码过度，因为它是可预检异常。
### 1 统一称谓
假如有一枚举类如下：
```java
public enum ReturnCodeEnum {
    OK(200),
    ERROR(500)
    ;
    private final int code;
    ReturnCodeEnum(int code){
        this.code=code;
    }
    public int getCode() {
        return code;
    }
}
```
>枚举实例有两个默认属性，`name` 和 `ordinal`，可通过 name()和ordinal()方法分别获得。其中 name 为枚举字面量（如 OK），ordinal 为枚举实例默认次序（从0开始）
需要注意的是，不建议使用枚举的 ordinal，因为枚举实例应该是无序的，ordinal 提供的顺序是不可靠的，所以我们应该使用自定义的枚举字段 code。

后文为方便阐述，以 字面量（name）、默认次序（ordinal）和 code来展开阐述。如 OK 的 字面量为 OK，ordinal 为 0 ，code为 200。
### 2 目标
#### 目标
1. 直接使用 枚举类型 **接收参数**和**返回值**
2. 系统自动将 参数中的 code 转换为 枚举类型，自动将 返回值中的枚举类型转换为 code

#### 实现效果
对于实现通用code枚举接口的枚举类型，有如下效果：
1. 使用 bean（**application/x-www-form-urlencoded**）接收时，支持 code 自动转换为 枚举类型，同时兼容 字面量转换为枚举类型。注意：表单接收的参数都视为 String，即是将String转为 枚举类型
2. 使用 @RequestBody （**application/json**）接收时，默认只支持 code 自动转换为枚举类型。如果需要同时支持 code 和 字面量（或者只支持字面量），可以在具体的枚举类里添加@JsonCreator注解的方法，下文会给出参考实现。
3. 可以使用 @RequestParam 和 @PathVariable 接收枚举类型参数
4. 使用 @ResponseBody / @RestController（返回 Json）时，默认将 枚举类型转换为 code。
5. 在接收参数/返回值都不允许使用 ordinal ，这只会导致混乱。

### 3 SpringMVC 对 枚举参数的处理
此处只对 restful 接口进行讨论。对于 restful 接口，Spring MVC 的返回值是使用 @ResponseBody 进行处理的。
而参数的接收方式则较多，对于非简单类型，如 Enum ，一般的接收方法为 Bean 接收或 @ResponseBody 接收。

#### Spring使用Bean接收枚举参数
简单来说 Spring 默认使用Bean接收枚举参数时支持 `字面量`，这也是我们常见的做法。
>参考自：[Spring与枚举参数](http://note4code.com/2018/03/12/spring%E4%B8%8E%E6%9E%9A%E4%B8%BE%E5%8F%82%E6%95%B0/)
>>GET 请求和 POST Form 请求中的字符串到枚举的转化是通过 org.springframework.core.convert.support.StringToEnumConverterFactory 来实现的.
>该类实现了接口 ConverterFactory ，通过调用 Enum.valueOf(Class, String) 实现了这个功能。
>向下追溯源码可以发现该方法实际上是从一个 Map<String, Enum> 的字典中获取了转换后的实际值，着这个 String 类型的 Key 的获取方式就是 Enum.name() 返回的结果，即`枚举的字面值`。
#### Spring使用@RequestBody 接收枚举参数
简单来说 Spring使用@RequeseBody 接收枚举参数时支持 `字面量和 ordinal`

对于@RequestBody，Spring会将其内容视为一段 Json，所做工作为使用 Jackson 完成反序列化。其实现会经过Jackson的EnumDeserializer的deserialize方法。感兴趣的可以去看看源码，这里不贴出来，讲一下思路：
1. 使用字面量（String）进行反序列化
2. 判断是否是 int 类型，如果是使用 ordinal 进行反序列化，如果数字不在 ordinal 里面，则抛异常
3. 判断是否是数组，是的话交由数组处理，否则抛异常
#### Spring使用@ResponseBody 返回值
如我们平常使用所见，返回的是字面量
### 4 思路
参照Spring对枚举参数的处理，我们可以提供覆盖/替换Spring的处理来达到我们的效果，
经本人测试，比较好的实现方案有（不考虑反射）：
1. 自定义Bean接收枚举参数规则：
    1. 可行方案
       通过Spring MVC注入特定类型自定义转换器实现从code到 枚举的自动转换
    2. 做法
       使用 WebMvcConfigurer的`addFormatters`注入自定义ConverterFactory，该工厂负责生成 通用code枚举接口的实现类对应的转换器
       详见第二部分--代码实现。
    3. 参考资料
       [Spring Boot绑定枚举类型参数](https://blog.csdn.net/u014527058/article/details/62883573)
2. 自定义@RequestBody 和@ResponseBody处理枚举参数
    1. 可行方案
       使用`@JsonValue`自定义特定枚举类的Jackson序列化/反序列化方式
        1. 具体做法
           使用 `@JsonValue`注解标记  获取code值的枚举实例方法。
        2. 注意事项
           该code值是使用jackson`序列化`/`反序列化`时枚举对应的值，会覆盖原来从字面量反序列化回枚举的默认实现。
           如果想要保留原来从字面量反序列化回枚举类的功能，需要自定义一个` @JsonCreator` 的构造/静态工厂方法。
        3. 相关代码
           代码如下：
           ```java
           @JsonValue
           public int getCode() {
               return code;
           }

           @JsonCreator
           public static ReturnCodeEnum create(String name){
               try{
                   return ReturnCodeEnum.valueOf(name);
               }catch (IllegalArgumentException e){
                   int code=Integer.parseInt(name);
                   for (ReturnCodeEnum value : ReturnCodeEnum.values()) {
                       if(value.code==code){
                           return value;
                           }
                   }
                   }
               throw new IllegalArgumentException("No element matches "+name);
           }
           ```

    2. 不可行方案
        1. 替换@RequestBody和@ResponseBody或相关处理器  / 自定义HttpMessageConverter
            - 例子
              如使用自定义的 @ResponseBody 注解及对应 HandlerMethodReturnValueHandler
              使用自定义 HttpMessageConverter 实现对 json 返回资源的完全控制
            - 不可行原因
              我们平时使用 @ResponseBody 是交给 `RequestResponseBodyMethodProcessor `这个类处理，所以我们也可以弃用@ResponseBody并自己写一个注解和对负责处理该注解的 HandlerMethodReturnValueHandler。这样我们就可以完全控制返回值的处理了。这样也就相对于放弃了 @ResponseBody。
              自己实现 HttpMessageConverter 则是在更高的层次进行处理，代价太大。

            - 相关资料
              [baeldung：Http Message Converters with the Spring Framework](https://www.baeldung.com/spring-httpmessageconverter-rest)
              [baeldung：Guide to Spring Type Conversions](https://www.baeldung.com/spring-type-conversions)
              自定义注解和HandlerMethodReturnValueHandler可以参考：
              [Spring MVC 更灵活的控制 json 返回（自定义过滤字段）](https://www.ctolib.com/topics-109580.html)
              [深入Spring:自定义ResponseBody](https://www.jianshu.com/p/4fa3006c066f)
              [spring自定义返回值解析器](http://www.xiaojiezhu.com/wordpress/?p=17#i)
              [详解SpringMVC中Controller的方法中参数的工作原理[附带源码分析]](http://www.cnblogs.com/fangjian0423/p/springMVC-request-param-analysis.html#interface_demo)
              [SpringMVC 学习笔记(七) JSON返回:HttpMessageConverter作用](https://blog.csdn.net/a67474506/article/details/46364159)
              [使用自定义HttpMessageConverter对返回内容进行加密](https://www.scienjus.com/custom-http-message-converter/)
              [自定义枚举 --- Gson转换](https://www.jianshu.com/p/e25ecc0c5762)
        2.	使用@JsonCreator在接口层面定义反序列化规则
              - 不可行原因
              **@JsonCreator只适用于枚举类不适用于接口。**
              @JsonCreator本质上是要在没有类实例的时候使用的，所以只能标记在 构造方法或者静态工厂方法上，接口的话不可行，传统的接口方法属实例方法，新增的 default 方法也属实例方法，另外的 static 方法又不可继承。所以这个思路只限于具体类型，不适用于接口。
              - 相关资料
              相关Jackson资料参考：
              [Github：Jackson注解官方文档](https://github.com/FasterXML/jackson-annotations/wiki/Jackson-Annotations)
              [Jackson常用注解详解1 初级2 中级](https://cloud.tencent.com/developer/article/1147127)
        3. 适用@JsonDeserialize在接口层面定义反序列化规则
            - 不可行原因
              **注解自定义从 json字符串 转换为 实体类的方法也只适用于枚举类不适用于接口。**
              使用@JsonDeserialize(using = 自定义反序列化类.class)，在自定义Jackson反序列化类实现deserialize(JsonParser p, DeserializationContext ctxt)方法。
              可以获取 json字符串（即 code），但没办法通过接口使用code获取枚举对象，理由同上，接口没有可用的同时可继承的方法。
            - 相关资料
              自定义Jackson序列化/反序列化类参考：[IBM:Jackson 框架的高阶应用](https://www.ibm.com/developerworks/cn/java/jackson-advanced-application/index.html)

## 二 代码实现
### 1 通用code枚举接口
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/12
 * @description: 带编号的枚举接口
 */
public interface CodedEnum {
    /**
     * 使用jackson序列化/反序列化时枚举对应的值
     * 如果想要保留原来从字面量反序列化回枚举类的功能，
     * 需要自定义一个 @JsonCreator 的构造/静态工厂方法
     * @return 自定义枚举code
     */
    @JsonValue
    int getCode();

}
```
### 2 转换器工厂类
代码实现
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/12
 * @description: 带编号的枚举转换器 工厂
 */
public class CodedEnumConverterFactory implements ConverterFactory<String, CodedEnum> {

    /**
     * 目标类型与对应转换器的Map
     */
    private static final Map<Class,Converter> CONVERTER_MAP=new HashMap<>();

    /**
     * 根据目标类型获取相应的转换器
     * @param targetType 目标类型
     * @param <T> CodedEnum的实现类
     * @return
     */
    @Override
    public <T extends CodedEnum> Converter<String, T> getConverter(Class<T> targetType) {
        Converter converter=CONVERTER_MAP.get(targetType);
        if(converter==null){
            converter=new IntegerStrToEnumConverter<>(targetType);
            CONVERTER_MAP.put(targetType,converter);
        }
        return converter;
    }

    /**
     * 将int对应的字符串转换为目标类型的转换器
     * @param <T> 目标类型（CodedEnum的实现类）
     */
    class IntegerStrToEnumConverter<T extends CodedEnum> implements Converter<String,T>{
        private Map<String,T> enumMap=new HashMap<>();

        private IntegerStrToEnumConverter(Class<T> enumType){
            T[] enums=enumType.getEnumConstants();
            for (T e:enums){
                //从 code 反序列化回枚举
                enumMap.put(e.getCode()+"",e);
                //从枚举字面量反序列回枚
                //是Spring默认的方案
                //此处添加可避免下面convert方法抛出IllegalArgumentException异常后被系统捕获再次调用默认方案
                enumMap.put(((Enum)e).name()+"",e);
            }
        }

        @Override
        public T convert(String source) {
            T result=enumMap.get(source);
            if(result==null){
                //抛出该异常后，会调用 spring 的默认转换方案，即使用 枚举字面量进行映射
                throw new IllegalArgumentException("No element matches "+source);
            }
            return result;
        }
    }

}
```
### 3 Spring MVC 配置类
#### 1 相关知识
1. Spring Boot 默认提供Spring MVC 自动配置，不需要使用@EnableWebMvc注解
2. 如果需要配置MVC（拦截器、格式化、视图等） 请使用添加@Configuration并实现WebMvcConfigurer接口.不要添加@EnableWebMvc注解。
3. @EnableWebMvc 只能添加到一个@Configuration配置类上，用于导入Spring Web MVC configuration
4. 如果Spring Boot在classpath里看到有 spring webmvc 也会自动添加@EnableWebMvc

简单来说就是在SpringBoot中不要使用@EnableWebMvc，使用@Configuration标记自定义@WebMvcConfigurer类就行，而且该类允许多个同时存在。

相关资料：
[Spring注解@EnableWebMvc使用坑点解析](https://blog.csdn.net/zxc123e/article/details/84636521)
[解析@EnableWebMvc 、WebMvcConfigurationSupport和WebMvcConfigurationAdapter](https://blog.csdn.net/pinebud55/article/details/53420481)
[WebMvcConfigurationSupport与WebMvcConfigurer的关系](https://www.jianshu.com/p/d47a09532de7)
[@EnableWebMvc如何禁止@EnableAutoConfiguration](https://blog.csdn.net/lqadam/article/details/80637335)

#### 2 代码实现
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/12
 * @description: 将转换器工厂添加到Spring
 */
@Configuration
public class CodedEnumWebAppConfigurer implements WebMvcConfigurer {

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new CodedEnumConverterFactory());
    }

}

```
## 三 测试及分析
### 1 枚举类
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/13
 * @description: 枚举类
 */
public enum ReturnCodeEnum implements CodedEnum {

    /**
     * 正常
     */
    OK(200),
    /**
     * 出错
     */
    ERROR(500)
    ;

    private final int code;

    ReturnCodeEnum(int code){
        this.code=code;
    }

    @Override
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static ReturnCodeEnum create(String name){
        try{
            return ReturnCodeEnum.valueOf(name);
        }catch (IllegalArgumentException e){
            int code=Integer.parseInt(name);
            for (ReturnCodeEnum value : ReturnCodeEnum.values()) {
                if(value.code==code){
                    return value;
                }
            }
        }
        throw new IllegalArgumentException("No element matches "+name);
    }


}
```
### 2 包含枚举类的POJO
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/12
 * @description: 枚举包装类
 */
@Data
public class MyResult{
    private ReturnCodeEnum returnCode;
    private String message;
}

```
### 3 测试类
```java
/**
 * @version V1.0
 * @author: linshenkx
 * @date: 2019/1/12
 * @description: 测试类
 */
@RestController
@RequestMapping("/test")
public class TestController {

  @PostMapping(value = "/enumForm")
  public MyResult testEnumForm(
         @RequestBody MyResult myResult) {
    ReturnCodeEnum status = myResult.getReturnCode();
    System.out.println("name():"+status.name());
    System.out.println("ordinal():"+status.ordinal());
    System.out.println("getCode():"+status.getCode());
    return myResult;
  }

  @PostMapping(value = "/enumJson")
  public MyResult testEnumJson(
          @RequestBody MyResult myResult) {
    ReturnCodeEnum status = myResult.getReturnCode();
    System.out.println("name():"+status.name());
    System.out.println("ordinal():"+status.ordinal());
    System.out.println("getCode():"+status.getCode());
    return myResult;
  }
  
  @PostMapping(value = "/enumPath/{status}")
  public ReturnCodeEnum testEnumPath(
          @PathVariable ReturnCodeEnum status) {
    return status;
  }

  @PostMapping(value = "/enumParam")
  public ReturnCodeEnum testEnumParam(
          @RequestParam ReturnCodeEnum status) {
    return status;
  }
}
```
另外还需注入上面的转换器工厂，这里不再重复贴出。
### 4 测试结果
#### 预测分析
如上，因为ReturnCodeEnum 实现了 CodedEnum 接口，并注入对应转换器工厂，所以可以在 表单提交的时候适用code和字面量接收枚举参数。
ReturnCodeEnum还写了@JsonValue注解的方法，所以使用Json传参/返回值时使用@JsonValue对应的返回值。
因为我们还想实现Json传参的时候支持字面量，所以我们在@JsonCreator注解的方法里写了支持 code 和字面量，该方法会使@JsonValue 对反序列化的支持失效，所以写的时候不仅要支持字面量还要支持原本的目的-----code。
由于我们已经覆盖了原来的序列化/反序列化方式，所以 ordinal 的支持已经失效。
另外，由于我们可以将参数中的String转化为枚举，所以我们也可以直接使用 @PathVariable 和 @RequestParam（Content-Type: multipart/form-data）来传递枚举参数(相关资料：[Baeldung：Guide to Spring Type Conversions](https://www.baeldung.com/spring-type-conversions))，但是注意这个时候不能使用 包含枚举类型的POJO类，除非你再定义一个从简单类型到复合类型的转换器。
#### 1 bean接收（application/x-www-form-urlencoded）
1. 字面量
   ![OK](https://img-blog.csdnimg.cn/2019011409281053.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   ```java
   name():OK
   ordinal():0
   getCode():200
   ```

2. code
   ![code](https://img-blog.csdnimg.cn/20190114092919865.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   ```java
   name():OK
   ordinal():0
   getCode():200
   ```

3. ordinal
   ![ordinal](https://img-blog.csdnimg.cn/20190114093114217.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   抛出异常
   >Field error in object 'myResult' on field 'returnCode': rejected value [0]; codes [typeMismatch.myResult.returnCode,typeMismatch.returnCode,typeMismatch.com.dx.hbdt.system.manager.hongbao.controller.ReturnCodeEnum,typeMismatch]; arguments [org.springframework.context.support.DefaultMessageSourceResolvable: codes [myResult.returnCode,returnCode]; arguments []; default message [returnCode]]; default message [Failed to convert property value of type 'java.lang.String' to required type 'com.dx.hbdt.system.manager.hongbao.controller.ReturnCodeEnum' for property 'returnCode'; nested exception is org.springframework.core.convert.ConversionFailedException: Failed to convert from type [java.lang.String] to type [com.dx.hbdt.system.manager.hongbao.controller.ReturnCodeEnum] for value '0'; nested exception is java.lang.IllegalArgumentException: No element matches 0]]

#### 2 @RequestBody 接收（application/json）
1. 字面量
   ![OK](https://img-blog.csdnimg.cn/20190114093238352.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   ```java
   name():OK
   ordinal():0
   getCode():200
   ```
2. code
   ![200](https://img-blog.csdnimg.cn/20190114093333135.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   ```java
   name():OK
   ordinal():0
   getCode():200
   ```
3. ordinal
   ![异常](https://img-blog.csdnimg.cn/2019011409350597.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   调用@JsonCreator的create方法的时候抛出 IllegalArgumentException 异常

4. 其他
   字符串是要携带引号的，如果不携带引号会解析错误，如{	"returnCode": OK }
   数字可不携带引号，在反序列化成枚举时仍会看成 String 对待，并获得与上面相同的效果。

#### 3 @PathVariable
![路径](https://img-blog.csdnimg.cn/20190114101616935.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
#### 4 @RequestParam（multipart/form-data）
![参数](https://img-blog.csdnimg.cn/20190114101654469.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)