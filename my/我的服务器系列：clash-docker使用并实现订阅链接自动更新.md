---
title: 我的服务器系列：clash-docker使用并实现订阅链接自动更新
id: clash_docker
permalink: clash_docker/
date: 2022-03-26 22:54:20
categories: 我的服务器系列
top: false
tags:
- 生产力
- clash
- docker
- 我的服务器系列
---
本文已删除
clash docker镜像使用笔记，以及常用代理配置方法。
2023.5月更新：使用filter实现自定义分组
2022.9月更新：提供自部署proxy-provider-converter容器及国内部署链接，解决因vercel被墙而无法访问的问题
2022.8月更新：使用clash-premium，并添加rule-providers及示例
2022.8月更新：添加no_proxy说明。
2022.7月更新：提供示例配置文件。添加docker pull使用代理方法。
2022.5月更新：完善配置订阅链接教程并自动选择最快节点。添加容器使用代理方法。
2022.3月更新：使用订阅链接并自动更新防止代理失效，并增加web端管理功能
<!-- more -->
## 一 设计思路及步骤
### 1. 获取clash订阅链接
   （不要问我怎么获取）
### 2. 将clash订阅链接转换成Clash的Proxy Provider
   参考 https://github.com/qier222/proxy-provider-converter
   ~~懒得部署的话可以用作者的 https://proxy-provider-converter.vercel.app
   或者是我的 https://proxy-provider-converter-sooty.vercel.app~~
   用我的会安全一点，因为我还不知道怎么查看到上面的订阅地址

2022.9更新：因vercel被墙，建议使用我部署的：https://ppc.linshenkx.cn

也可自行部署，参考：https://github.com/linshenkx/baseDockerImage/tree/master/proxy-provider-converter

### 3. 配置Proxy Provider
   在clash配置文件中配置Proxy Provider，实现代理服务器列表的自动更新
   clash配置文件，可以从订阅链接下载得到，再修改即可。或者我后面贴出来自用的。
### 4. 启动clash
启动dreamacro/clash或dreamacro/clash-premium容器，加载配置文件，进行clash服务
### 5. 启动clash-web
   启动haishanh/yacd容器，对clash进行web管理
   可以直接用作者部署的：http://yacd.haishan.me

## 二 clash配置文件
参考配置：https://raw.githubusercontent.com/linshenkx/myFiles/master/blogFiles/clash/config.yaml
注意，如果raw.githubusercontent.com无法访问可以尝试使用第三方加速：raw.gitmirror.com

### 添加 proxy-providers 并修改 proxy-groups
主要修改地方是在proxy-providers和proxy-groups。

rules是根据proxy-groups配置的，数量比较多，具体参考从订阅地址得到的clash配置文件。或者自己从网上获取，这些是比较通用的。

可以看到proxy-groups中的配置都引用了`use: ['LIAN']`来导入节点配置。
且使用了 url-test 来自动选出最快的代理。

默认clash配置文件：
![默认clash配置文件](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/1652843670(1).png)

修改之后的clash配置文件：
![修改之后的clash配置文件](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/1652845276(1).png)

使用效果，以**电报消息**为例，默认使用代理是**节点选择**，
而**节点选择**使用的代理是**自动选择**，所以**电报消息**默认使用的代理是节点池最快的节点。
![使用效果](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/1652845859(1).png)

一般只需要修改proxy-providers的LIAN的url和path，
如果更换机场，也只需要重新生成clash订阅链接，然后修改这两个位置即可


### 使用 rule-providers
规则总是会更新的，如果使用的是clash-premium（专业版）的话，可以考虑用rule-providers

相关说明见：https://github.com/Dreamacro/clash/wiki/premium-core-features#rule-providers

这里使用的是 https://github.com/Loyalsoldier/clash-rules 提供的规则。
完整配置见文末示例：

注意，这里把raw.githubusercontent.com都换成了raw.githubusercontents.com
见 https://gitmirror.com/raw.html ，否则第一次启动时无法获取规则文件，会导致启动失败

不过这样会产生强依赖，即rules文件必须可访问，否则无法启动
而rules文件一般又无法直接在墙内访问，又得依赖第三方的加速服务，风险其实很高
所以并不是很建议，自行斟酌

###  自定义分组
感谢评论区的需求提醒。

大部分情况下使用“自动选择”得到的最低延迟的节点就可以了。
但如果想要排除某个节点，或者限制节点只在某个区域中选择，就需要使用proxy-groups的filter功能了，如下：
```yaml
proxy-groups:
   - { name: 'PROXY', type: select,proxies: ['自动选择-香港','自动选择-所有','自动选择-美国','节点选择', DIRECT] }
   - { name: '节点选择', type: select,use: ['LIAN'] }
   - { name: '自动选择-所有', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50, use: ['LIAN'] }
   - { name: '自动选择-香港', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50,filter: 'HK|香港', use: ['LIAN'] }
   - { name: '自动选择-美国', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50,filter: '美国', use: ['LIAN'] }
```

## 三 启动clash
### docker启动
需自行提供config.yaml 文件，这里推荐直接使用host网络，可以直接使用127.0.0.1 7890作为代理
注意这里使用的是dreamacro/clash-premium，也可用dreamacro/clash，放弃高级功能
```shell
docker run --name clash --network host --restart=always  -v /opt/clash/config.yaml:/root/.config/clash/config.yaml -d dreamacro/clash-premium 

```
### 常规安装
如果没有安装docker的话，可以使用常规方法启动
1. 下载
   https://github.com/Dreamacro/clash/releases
2. 配置
```shell
gzip -d clash-linux-amd64-v1.5.0.gz
mkdir /opt/clash
mv clash-linux-amd64-v1.5.0 /opt/clash/clash
echo "/opt/clash/clash >/opt/clash/start.out 2>&1  &" >> /opt/clash/start.sh
chmod -R +x  /opt/clash/

```
把配置文件放到/root/.config/clash 下取代默认的config.yaml
3. 启动
```shell
sh /opt/clash/start.sh 
```
4. 查看clash启动日志
```shell
tail -n 100 -f /opt/clash/start.out
```

## 四 安装clash-web
连接的时候填写 http://clash机器ip:clash-controller端口，以及secret密码。
密码和端口都在上面clash配置。
```shell
docker run --restart=always  -p 7880:80 -d  --name clash-web haishanh/yacd

```

## 五 使用代理服务
### 1 linux系统设置代理
在 /etc/profile 添加all_proxy配置
no_proxy则配置不走代理，注意这和clash的直连还不一样。
如 *.linshenkx.cn对应ip为tailscale内网ip，外部无法访问
这时如果使用clash的直连则会提醒连接失败，而配置在no_proxy则会让其走tailscale的代理成功访问。
```shell
echo 'export all_proxy="http://127.0.0.1:7890"'>> /etc/profile
echo 'export http_proxy="http://127.0.0.1:7890"'>> /etc/profile
echo 'export https_proxy="http://127.0.0.1:7890"'>> /etc/profile
echo 'export no_proxy="127.0.0.1,*.linshenkx.cn"'>> /etc/profile

```

### 2 docker容器设置代理
参考：
https://docs.docker.com/network/proxy/

可以设置环境变量，如`ENV HTTP_PROXY="http://192.168.1.12:3128"`
但无法使用127.0.0.1，除非同时配置`--network host`。

且实测，环境变量方法难生效。

建议使用修改 **~/.docker/config.json** 的方法。

配置以下内容：
```json
{
 "proxies":
 {
   "default":
   {
     "httpProxy": "http://127.0.0.1:7890",
     "httpsProxy": "http://127.0.0.1:7890",
     "noProxy": "127.0.0.1,*.linshenkx.cn,127.0.0.0/8"
   }
 }
}
```
容器内会自动添加HTTP_PROXY、HTTPS_PROXY、NO_PROXY、http_proxy、https_proxy、no_proxy等变量

### 3 docker命令设置代理
注意不是给docker容器设置代理
参考：https://docs.docker.com/config/daemon/systemd/#httphttps-proxy
主要用于docker pull。
也可通过配置镜像加速来达到类似效果，
不过注意镜像加速覆盖不全面，
而且有坑，例如阿里的镜像加速有时候就拉不到最新的镜像（如：halohub/halo:latest）

### 4 java程序设置代理
测试时，在通过代码方式添加：
```java
System.setProperty("proxyHost", "127.0.0.1");
System.setProperty("proxyPort", "7890");
```
发布时，建议通过jvm参数配置：
```shell
-DsocksProxyHost=127.0.0.1 -DsocksProxyPort=7890
-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890
-Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890

```
如下，为使用系统代理方式启动halo，这样就可以在halo的管理界面使用在线下载、更新主题功能了，否则github连接过慢主题基本无法在线下载
```shell
docker run -it -d --name halo --network host -e JVM_OPTS="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890" -v /opt/halo/workspace:/root/.halo --restart=always halohub/halo

```
### 5. 测试代理是否生效
可在命令行使用wget测试连接，如下
可以看到走了my.win:7890的代理
![代理](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/1659668585584.png)
加上no_proxy则是直连：
![直连](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/1659668681939.png)

### 6. no_proxy相关说明
no_proxy很重要，因为不是所有的流量都需要经过clash的，如localhost。
就算localhost在clash是直连，也和不走clash是不一样的。
特别是用上了tailscale，tailscale的流量如果走了clash（直连）就会出现dns解析错误。
所以最好把tailscale的域名配置在no_proxy里面。
但是需要注意，no_proxy本身是不规范的，不同的程序/系统对其处理也是不一样的。
参考：https://about.gitlab.com/blog/2021/01/27/we-need-to-talk-no-proxy/

此外不同系统也会有影响，例如grafana的Alpine镜像就没有处理no_proxy,换成Ubuntu镜像则可以。
所以，在选镜像的时候建议不要一味地选小体积的镜像版本。

## 完整示例
![效果图](https://lian-gallery.oss-cn-guangzhou.aliyuncs.com/img/202305161144815.png)

配置如下，注意这里使用了rule-providers

不使用rule-providers的见：https://raw.githubusercontent.com/linshenkx/myFiles/master/blogFiles/clash/config.yaml

```yaml
#port: 7890
#socks-port: 7891
#redir-port: 7892
# 使用混合端口
mixed-port: 7890
# 部署在公网，关闭lan
allow-lan: false
bind-address: "*"
mode: Rule
log-level: info
ipv6: false
hosts:
  services.googleapis.cn: 216.58.200.67
  www.google.cn: 216.58.200.67
# 外部管理IP和端口
external-controller: 0.0.0.0:29090
# 外部管理密码
secret: '123456'
clash-for-android:
  append-system-dns: false
profile:
  tracing: true
dns:
  enable: true
  listen: 127.0.0.1:8853
  default-nameserver:
    - 223.5.5.5
    - 1.0.0.1
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-filter:
    - "*.lan"
    - stun.*.*.*
    - stun.*.*
    - time.windows.com
    - time.nist.gov
    - time.apple.com
    - time.asia.apple.com
    - "*.ntp.org.cn"
    - "*.openwrt.pool.ntp.org"
    - time1.cloud.tencent.com
    - time.ustc.edu.cn
    - pool.ntp.org
    - ntp.ubuntu.com
    - ntp.aliyun.com
    - ntp1.aliyun.com
    - ntp2.aliyun.com
    - ntp3.aliyun.com
    - ntp4.aliyun.com
    - ntp5.aliyun.com
    - ntp6.aliyun.com
    - ntp7.aliyun.com
    - time1.aliyun.com
    - time2.aliyun.com
    - time3.aliyun.com
    - time4.aliyun.com
    - time5.aliyun.com
    - time6.aliyun.com
    - time7.aliyun.com
    - "*.time.edu.cn"
    - time1.apple.com
    - time2.apple.com
    - time3.apple.com
    - time4.apple.com
    - time5.apple.com
    - time6.apple.com
    - time7.apple.com
    - time1.google.com
    - time2.google.com
    - time3.google.com
    - time4.google.com
    - music.163.com
    - "*.music.163.com"
    - "*.126.net"
    - musicapi.taihe.com
    - music.taihe.com
    - songsearch.kugou.com
    - trackercdn.kugou.com
    - "*.kuwo.cn"
    - api-jooxtt.sanook.com
    - api.joox.com
    - joox.com
    - y.qq.com
    - "*.y.qq.com"
    - streamoc.music.tc.qq.com
    - mobileoc.music.tc.qq.com
    - isure.stream.qqmusic.qq.com
    - dl.stream.qqmusic.qq.com
    - aqqmusic.tc.qq.com
    - amobile.music.tc.qq.com
    - "*.xiami.com"
    - "*.music.migu.cn"
    - music.migu.cn
    - "*.msftconnecttest.com"
    - "*.msftncsi.com"
    - localhost.ptlogin2.qq.com
    - "*.*.*.srv.nintendo.net"
    - "*.*.stun.playstation.net"
    - xbox.*.*.microsoft.com
    - "*.ipv6.microsoft.com"
    - "*.*.xboxlive.com"
    - speedtest.cros.wr.pvp.net
  nameserver:
    - https://223.6.6.6/dns-query
    - https://rubyfish.cn/dns-query
    - https://dns.pub/dns-query
  fallback:
    - https://dns.rubyfish.cn/dns-query
    - https://public.dns.iij.jp/dns-query
    - tls://8.8.4.4
  fallback-filter:
    geoip: true
    ipcidr:
      - 240.0.0.0/4
      - 0.0.0.0/32
      - 127.0.0.1/32
    domain:
      - +.google.com
      - +.facebook.com
      - +.twitter.com
      - +.youtube.com
      - +.xn--ngstr-lra8j.com
      - +.google.cn
      - +.googleapis.cn
      - +.googleapis.com
      - +.gvt1.com
proxy-providers:
  LIAN:
    type: http
    # 这里填proxy-provider-converter转换得到的链接
    url: https://proxy-provider-converter-sooty.vercel.app/api/convert?url=***&target=clash
    interval: 3600
    # 这里也根据proxy-provider-converter填写
    path: ./api.nxtlnodes.com.yaml
    health-check:
      enable: true
      interval: 600
      # lazy: true
      url: http://www.gstatic.com/generate_204
proxy-groups:
    - { name: 'PROXY', type: select,proxies: ['自动选择-所有','自动选择-香港','自动选择-美国','节点选择', DIRECT] }
    - { name: '节点选择', type: select,use: ['LIAN'] }
    - { name: '自动选择-所有', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50, use: ['LIAN'] }
    - { name: '自动选择-香港', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50,filter: 'HK|香港', use: ['LIAN'] }
    - { name: '自动选择-美国', type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50,filter: '美国', use: ['LIAN'] }
rules:
  - RULE-SET,applications,DIRECT
  - DOMAIN,clash.razord.top,DIRECT
  - DOMAIN,yacd.haishan.me,DIRECT
  - RULE-SET,private,DIRECT
  - RULE-SET,reject,REJECT
  - RULE-SET,icloud,DIRECT
  - RULE-SET,apple,DIRECT
  - RULE-SET,google,DIRECT
  - RULE-SET,proxy,PROXY
  - RULE-SET,direct,DIRECT
  - RULE-SET,lancidr,DIRECT
  - RULE-SET,cncidr,DIRECT
  - RULE-SET,telegramcidr,PROXY
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
rule-providers:
  reject:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/reject.txt"
    path: ./ruleset/reject.yaml
    interval: 86400
 
  icloud:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/icloud.txt"
    path: ./ruleset/icloud.yaml
    interval: 86400
 
  apple:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/apple.txt"
    path: ./ruleset/apple.yaml
    interval: 86400
 
  google:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/google.txt"
    path: ./ruleset/google.yaml
    interval: 86400
 
  proxy:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/proxy.txt"
    path: ./ruleset/proxy.yaml
    interval: 86400
 
  direct:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/direct.txt"
    path: ./ruleset/direct.yaml
    interval: 86400
 
  private:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/private.txt"
    path: ./ruleset/private.yaml
    interval: 86400
 
  gfw:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/gfw.txt"
    path: ./ruleset/gfw.yaml
    interval: 86400
 
  greatfire:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/greatfire.txt"
    path: ./ruleset/greatfire.yaml
    interval: 86400
 
  tld-not-cn:
    type: http
    behavior: domain
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/tld-not-cn.txt"
    path: ./ruleset/tld-not-cn.yaml
    interval: 86400
 
  telegramcidr:
    type: http
    behavior: ipcidr
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/telegramcidr.txt"
    path: ./ruleset/telegramcidr.yaml
    interval: 86400
 
  cncidr:
    type: http
    behavior: ipcidr
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/cncidr.txt"
    path: ./ruleset/cncidr.yaml
    interval: 86400
 
  lancidr:
    type: http
    behavior: ipcidr
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/lancidr.txt"
    path: ./ruleset/lancidr.yaml
    interval: 86400
 
  applications:
    type: http
    behavior: classical
    url: "https://raw.githubusercontents.com/Loyalsoldier/clash-rules/release/applications.txt"
    path: ./ruleset/applications.yaml
    interval: 86400
    
```
