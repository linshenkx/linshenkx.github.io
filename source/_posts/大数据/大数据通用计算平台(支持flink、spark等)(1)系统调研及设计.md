---
title: 大数据通用计算平台(支持flink、spark等)(1)系统调研及设计
categories: [大数据]
top: true
date: 2021-01-09 21:08:41
tags: 
    - flink
    - spark
---
项目源于对flink_sql流计算任务的实际使用需求，最初目标是设计一个系统可以在线提交sql生成flink流式计算任务，并进行监控监测。 后延申至支持在线jar包提交的方式，同时支持批式计算任务。并以模块化开发的思路，引入对spark的支持。
<!-- more -->
### 一 简介
#### 1 系统介绍
本系统基于多种不同的底层计算框架，如flink、spark，提供可视化web界面，实现大数据任务的在线发布、管理、监控等功能。
支持多种任务类型，如sql提交、jar包提交等，屏蔽底层部署细节与参数配置，使开发人员可以专注于业务本身，提高工作效率
平台本身依托于现有大数据计算框架，不会引入其他依赖，不会对现有开发造成入侵，可放心使用。

#### 2 设计目标
1. 支持多种计算框架：flink、spark等
2. 支持多种计算任务：批、流
3. 支持多种任务类型：sql、jar包
4. 支持功能：发布、停止、删除、监控等
5. 零入侵：纯客户端工具，不需要调整业务代码，不需要修改平台配置

#### 3 RoadMap
1. 支持更多的提交方式，如脚本提交
2. 支持更多的计算框架，如storm
3. 支持更多的底层运行平台，如kubernetes、standalone等

### 二 设计调研
#### 0 基础方向
##### 1. 底层运行平台的选择
不管是flink还是spark，都只是计算框架，需要真正的运行平台作为支持，主流的有yarn、kubernetes、standalone等
1. local模式基本只适用于测试，这里不作考虑   
2. 其中standalone即独立集群模式建设维护成本高，且重复建设易造成资源浪费（如flink一套、spark一套）。
   不过standalone往往可以实现更多的特性，如spark的spark.master.rest.enabled配置项就只支持standalone模式，
   而且大部分时候开发者只会用其中一个平台，并不存在重复建设的情况。
   这里出于开发成本考虑，先不作实现，后续考虑支持。
3. 各个计算框架基本都出了对k8s的支持，但文档来看还并不成熟，实际生产环境使用还较少，先观望，后续考虑支持。
4. Mesos我不熟
根据排除法，就只剩下yarn作为底层计算框架了。
优点是成熟、稳定，经过大规模检验，基本生产环境都是用yarn，而且不同的计算框架都可以共用一套yarn计算平台。

##### 2. 提交部署方式的选择
1. 在确定底层运行平台使用yarn之后，提交部署方式主要就剩下cluster、client两种了（此处使用spark的说法）
两者的区别主要在于启动程序的解析运行在客户端还是在集群上进行。
作为平台型工具，自然是选择cluster，减小客户端压力。client更适合个人调试用，可以直接看到输出。
2. 对应flink的说法即为 per-job方式（客户端）和application方式（集群），即使用application方式。
另外需注意，application方式得在flink高版本（1.11+）才有。
3. 另外，flink还有个session模式，简单理解为上面的是一任务一集群，这个是多任务一集群，适合轻量级使用，自带web端jar包提交，方便快捷。
但不建议生产环境使用，很容易一个任务崩就导致集群崩溃。

##### 3. sql任务的实现
将sql保存为文件，使用约定好的jar程序进行解析，即将sql任务转化为jar任务。其他类型的任务同理。
#### 1 flink
flink计算平台网上有很多，其中质量比较好且更新时间比较近的主要有：Flink-SQL流计算平台管理系统（ https://github.com/zhp8341/flink-streaming-platform-web ）
本人最开始就是受了这个系统启发，最初的代码和思路也有部分参考，比较推荐。
优点是功能完整，且更新快。不过sql方面定制化程度有点高，不够通用，存在一定程度的入侵，且功能对于我来说有点花哨，支持flink本地模式、yarn-per模式、STANDALONE模式，最新的application模式倒没有。

##### 代码提交or接口提交or命令行提交？
1. 代码提交？
yarn-application方式官方不支持，网上有的一般是session模式的，还有一些自己看源码挖出来提交代码的。
这里不推荐的去挖代码，官方没有放出来的东西可能换个版本就不一样了，如非必要，这种开发思路并不可取。
2. 接口提交？
flink的web界面确实有jar包提交功能，但首先要把flink跑起来，即session模式，这里不使用。
3. 命令行提交
默认的提交方法，万能的。

##### 监控实现？
1. 提交yarn的时候指定tag，根据tag进行搜索，获取任务的appId，进行任务追踪
2. yarn层根据appId和yarn的rest接口跟踪任务在yarn上的状态
3. flink层根据appId可以组成出flink的web监控页面，同时flink提供了web界面所需的各项数据的rest接口，可以二次开发

##### 任务管理？
flink任务的停止可以直接调用其rest接口
savepoint信息也可以提供rest接口获取，savepoint的执行通过rest执行好像有问题，这里还是先用命令行操作
#### 2 spark
spark作为一个~~过时~~成熟稳重的计算框架，虽然不支持流批一体，但是相关的第三方框架更加成熟。
##### 代码提交or接口提交or命令行提交？
我们还是先从官网看起。大体情况和flink类似。
没有官方的代码提交接口，都是各自挖掘出来的，而且写法还都不一样，这里不推荐。
接口提交有个spark.master.rest.enabled配置项，但只支持standalone模式
所以还是走命令行提交
##### 监控实现？
同flink，yarn层api+spark自身api
##### 任务管理？
主要就是想找个spark原生的rest api来kill它。
网上有一些spark隐藏rest api合集之类的东西，我本身是不想用的，毕竟你都知道是隐藏了，说明官方还不想给你用，你又不知道什么时间哪个版本就会变了
不过我也很好奇为什么官方不提供，很多人跟我有同样的想法，还跑去问了。https://issues.apache.org/jira/browse/SPARK-12528
standalone已经可以通过spark.master.rest.enabled来用了，但yarn还不行。讨论的人有提到可以用Livy或spark-jobserver。
1. spark-jobserver的社区比较活跃，更新比较快，功能也很强大，但是需要继承指定类，造成极强的入侵性，这是无法容忍的，这里不做考虑。
按我的理解，你都能继承自己的类了，那你做出什么增强的功能都不稀奇，因为你本质上已经不是工具型产品，而是一个基于spark二次开发的平台，还不支持spark原生jar包。
2. Livy毕竟是Apache孵化项目，虽然还没毕业，但使用还是没什么问题的。
接口很简单，使用也很方便。主要就是可以通过livy的rest接口实现任务的发布、停止、状态获取、日志获取。
其实livy的存在已经和本项目对spark的支持重复了...但是本着轮子要自己造的思想，我们还是来~~挑挑刺~~研究一下livy的优缺点
嗯...文档不清晰：虽然参数都是对官方的封装，但是缺少必要的描述说明，比方说没有说jar包的路径默认是hdfs的（当然这不是主要问题...）
其实没什么大问题，还是推荐使用的，任务提交我们已经通过脚本方式实现了，这里就没必要再引入livy了，毕竟是个单独的web服务器，也挺重的。
   
既然如此就还是走yarn的api去kill吧。

### 三 设计思路
项目以分为三个类型工程
1. core ：核心处理工程。实现核心逻辑，对外提供统一的计算任务管理接口，不同计算平台任务依赖不同模块工程进行实现
2. module : 计算平台处理工程。对接不同的底层计算平台，如flink和spark
3. plugin : 独立插件工程。本质为自定义功能jar包，封装特定任务，按约定进行解析处理。如flink-sql的jar包封装。

#### core工程
core是计算平台的核心。对不同类型的任务进行封装，对外提供统一的api。并在数据库中记录、跟踪任务信息。
从功能设计来看主要类有：
- controller：对外接口类
  对外提供start、stop、delete、getLog、getStatus等api
  start需传入任务配置json，根据任务类型的不同交由不同的module工程的JobServer去解析处理。
  start、stop、delete 也需调用不同的JobServer进行实现。
  getLog、getStatus本质上只是读取数据库，而数据库的信息维护和同步也依赖各个module工程。
- jobInfo: 任务信息类
  对不同任务的统一封装，拥有以下属性
  deployMode 任务类型：FLINK_SQL、FLINK_JAR、SPARK_SQL、SPARK_JAR等
  runConfig 运行时配置，json，不同类型任务不同
  runInfo 运行时信息，json，不同类型任务不同，如flink任务包含yarn运行信息和flink的jobId、savepoint信息等
  runLog 任务运行日志,text，用以记录任务的基本操作记录以及状态更改记录等（不包含业务日志，不属于监控范围）
  status 任务运行状态，基于yarn的job status进行抽象。各个类型任务可以有自身的状态标识，但必须实现特定接口以转化为顶层标准status。
- JobServer: 任务处理核心抽象接口
  定义了 start、stop、delete、checkAllJobStatus、checkJobStatus(String jobInfoId)等接口并由各个模块自行实现
- SchedulerTask：定时任务类
  定时调用各个模块的checkStatus接口，用以检测任务真实运行状态，维护数据库任务信息真实性有效性，防止已停任务仍在运行

另外我还把命令行执行模块、yarn功能管理模块放到了这里。  
命令行执行要包含日志记录、异步处理、异常处理、多命令同会话执行，还是比较麻烦的，踩了一些坑，以后再开一篇分享一下。
本来的设想就是把yarn作为基础运行平台，所以对yarn的操作也统一到了这里。
#### module工程
一个deployMode对应一个JobServer实现类，相同类型的JobServer可共用一个module工程，如FLINK_SQL和FLINK_JAR
各个module工程以其JobServer实现类为核心，拥有自己的runConfig、runInfo、status实体类
除此之外，根据需求，还可以有自身的定时任务类，如Flink可定时执行savepoint操作
#### plugin工程
plugin工程本质上为特殊任务类型的支持实现。
这里以FLINK_SQL工程为例。

Flink原生的sql只支持shell执行，且需在session模式中运行，
使用上也不算十分方便，需要先在配置文件中写好各种连接配置，下载好各种connector的jar包。
作为测试用倒还可以，语句可以直接修改，不用重新打包，但性能、可靠性都存疑，本质上难以在生产环境中应用。
而Jar包执行是绝对通用的，sql的功能基本都可以通过flink的executeSql来执行，理论上对sql脚本进行解析，一句句转成用executeSql来调用即可。
不过也有一些坑，比分说hive-catalog的相关配置，我觉得flink关于hive的设计是比较别扭的，hive一方面是作为元数据仓库使用，一方面又可以作为数据源连接，另外flink还支持hive作为sql方言使用。
而hive的连接也相对复杂一些，需要先准备hive-conf配置文件，其jar包的位置也应该是放到flink的classpath下，而不是用户的fat-jar。注意，这一点和connector是不一样的。
对于元数据仓库catalog、方言dialect这些特殊sql语句，都需要识别出来调用专门代码实现，而不能直接使用executeSql

sql脚本应该通过文件作为参数传递给Jar包进行读取，其他类型的任务同理，无非是把sql脚本换成scala脚本、shell脚本之类的
具体做法是将sql写为本地临时文件，通过flink的yarn.ship-files参数分发到Jar包运行容器里面，sql文件路径作为Jar包启动参数即可。
