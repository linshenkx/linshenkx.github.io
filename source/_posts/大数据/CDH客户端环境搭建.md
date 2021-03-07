---
title: CDH客户端环境搭建
date: 2020-11-10 21:51:20
categories: 大数据
top: false
tags:
- CDH
---
最近遇到一个需求：要使用azkaban对接客户的CDH集群，CDH用的是oozie，azkaban只能部署在我们客户端的机器上，所以需要在客户机上手动搭建CDH的hadoop环境。操作很简单，过程比较麻烦，这里记录一下。
<!-- more -->
## 一 获取所需CDH rpm包
### 1. 搭建本地CDH package仓库
说明：CDH有两种本地仓库配置方式，package和parcel。官方是推荐使用package，我推荐两种都配置好，CDH还是用parcel。package方式可用于获取rpm包。
https://docs.cloudera.com/documentation/enterprise/6/latest/topics/cm_ig_create_local_package_repo.html
yum包的下载建议使用idm的站点抓取功能，不要用wget下载
### 2. 使用 yumdownloader 获取rpm包
这一步需要在docker容器环境下进行，这样环境很纯粹，获取到到rpm包更完整，参考：https://blog.csdn.net/alinyua/article/details/108071365
```shell script
# yum install yum-utils -y
mkdir cdh-packages && cd cdh-packages 
yumdownloader --resolve  hadoop-client hbase hive-hbase spark-core
cd .. && tar -zcf cdh-packages.tar.gz cdh-packages
```
## 二 安装CDH rpm包
安装时虽然不会有依赖缺少，但可能由于系统版本关系部分系统自带软件版本不一致，我是参考错误提示直接忽略掉，后面也没有遇到问题。
```shell script
tar -zxf cdh-packages.tar.gz
yum -y localinstall cdh-packages/*.rpm
```
## 三 配置CDH 环境
### 1. 配置环境变量
```shell script
echo "export HADOOP_HOME=/usr/lib/hadoop">> /etc/profile
echo "export HBASE_HOME=/usr/lib/hbase">> /etc/profile
echo "export HIVE_HOME=/usr/lib/hive">> /etc/profile
echo "export SPARK_HOME=/usr/lib/spark">> /etc/profile
echo "export HADOOP_CONF_DIR=/etc/hadoop/conf/">> /etc/profile

source /etc/profile
```
### 2. 添加配置文件
在CDH管理界面下载各组件的客户端配置，添加到对应文件夹下
各组件配置文件位置如下：
hadoop/yarn: /etc/hadoop/conf/
hbase: /etc/hbase/conf    
hive: /etc/hive/conf
## 四 验证
输入以下命令对各个组件进行验证
### 1. hdfs
```shell script
hadoop fs -ls /
```
### 2. yarn
```shell script
yarn node -list
```
### 3. hbase
```shell script
hbase shell

status
```
### 4. hive
```shell script
hive shell

show tables;
```
### 5. spark
```shell script
# 能正确进入即可
spark-shell

```
>如果报错：java.lang.NoSuchMethodError: jline.console.completer.CandidateListCompletionHandler.setPrintSpaceAfterFullCompletion(Z)V
>根据：https://issues.apache.org/jira/browse/SPARK-25783
>可下载 jline-2.14.3.jar 放到 $SPARK_HOME/jars 下
下载地址：https://repo1.maven.org/maven2/jline/jline/2.14.3/jline-2.14.3.jar