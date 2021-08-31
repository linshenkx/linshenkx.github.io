---
title: Xloggc实践（JVM1.8及之前）
id: Xloggc
permalink: Xloggc/
date: 2020-08-20 00:55:34
categories: 后端开发
top: false
tags:
- jvm
---
Java服务器调优免不了要对gc日志进行分析，我一般是上传gc日志文件到GCEasy进行处理的，上传的文件有大小限制。另外默认的gc日志打印还会存在重启后丢失的问题。综上，我们希望gc日志文件在不能丢失（但允许超过一定时间或大小被清理掉）的情况下控制gc日志的大小或者按时间切割，即像Java日志框架那样的效果。Java9对jvm的日志系统进行了比较大的升级，可以比较好的实现这些需求，但大部分服务端的Java软件还只支持Jdk8，本文记录作者自己的相关配置。
<!-- more -->
### 分析
首先推荐看两篇gceasy的博客文章，网上对UseGCLogFileRotation的相关讨论很多都来自于这里：
https://blog.gceasy.io/2016/11/15/rotating-gc-log-files/
https://blog.gceasy.io/2019/01/29/try-to-avoid-xxusegclogfilerotation/

简单来说，UseGCLogFileRotation 可以控制gc日志文件大小，且按日期分片切割
缺点是：

1. 记录丢失
   个人认为不是问题，超过指定文件数量及大小的日志被丢弃是预期操作。
2.  循环打印
    若限制日志文件数共5个，分别为0、1、2、3、4，在文件4达到文件最大值后系统将从1开始覆写，最终的结果就是顺序错乱，不能直接使用（需要人为地修改文件名以修正顺序）
3. 重启后从编号0开始写入，而非上次的写入位置。结合第2点你就会发现你的日志顺序已经完全不可信了。

### 应对方法
0. 直接使用-Xloggc:gc-%t.log（`推荐`）
   简单粗暴，缺点是文件依然太大，需要用自己切割
1. 结合-Xloggc:gc-%t.log使用
   使用 -Xloggc:gc-%t.log可以解决问题3，但仍存在循环打印。
    1. 设置较大的文件数量和大小限制，尽量使其不产生循环打印
       上面文章讨论区的一个小伙伴提出的，其实也是个办法
       以下是我的日志文件输出测试，不同一个批次的文件数量限制可能不同，用蓝框隔离。
    2. 手动调整顺序（其实也不麻烦）。
3. 如果是业务系统的话直接用高版本的jdk吧，不用看这篇文章了

### 示例
（使用两个gc日志文件，每个文件最大为1k）：
每一个批次都有一个current后缀的日志文件标识当前写入，同一批次的日志文件用从0开始的序号后缀隔开，通常current应该在序号最大的位置，如果不是则说明存在循环打印的情况。
```shell
-Xmx60M -Xms60M -XX:+PrintGCDetails  -XX:+PrintGCDateStamps  -Xloggc:gc-%t.log  -XX:+UseGCLogFileRotation  -XX:NumberOfGCLogFiles=2  -XX:GCLogFileSize=1K
```


![日志示例](https://img-blog.csdnimg.cn/20200820003502171.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)
