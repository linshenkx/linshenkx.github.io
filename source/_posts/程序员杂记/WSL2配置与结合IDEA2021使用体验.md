---
title: WSL2配置与结合IDEA2021使用体验
id: wsl2_idea2021
permalink: wsl2_idea2021/
date: 2021-04-13 22:54:20
categories: 程序员杂记
top: false
tags:
    - 生产力
    - WSL
---
最近把IDEA更新到了2021，发现新版本增强了对WSL2的支持。之前的WSL2很鸡肋，吹很厉害，但真要开发又很不方便。 本来还想等着windows增强WSL2对gui的支持，然后在WSL2里装个IDEA。
倒是IDEA动作快一点，先做了支持。不错，值得捣鼓一番。之前为了gui把wsl环境弄得很混乱，直接重装，随便记录一下操作。
<!-- more -->
### 一 配置WSL
按惯例，先给出官方文档地址，基础性操作参考这个： https://docs.microsoft.com/zh-cn/windows/wsl/
#### 1 开启wsl
参考：https://docs.microsoft.com/zh-cn/windows/wsl/install-win10
##### 1 安装「适用于 Linux 的 Windows 子系统」和「虚拟机平台」这两个可选组件
```shell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```
##### 2 重启
##### 3 配置默认使用wsl2
```shell
 wsl --set-default-version 2
```
#### 2 安装windows terminal
在应用商店下载安装，自行美化即可，新版本已可直接通过选项配置，不需要直接操作配置文件
### 二 配置ubuntu
#### 1 安装ubuntu
在应用商店搜索下载ubuntu，当前版本为：20.04.2，下载完打开图标进行安装
安装过程会提示输入一个默认用户和对应密码，注意不能用root（已存在）
#### 2 修改默认用户为root
##### 1 查看当前wsl列表：
   之所以要这一步是因为如果装了多个版本的ubuntu，其标识可能不一样
   ```shell
   wsl -l 
   ```
##### 2 修改对应wsl默认用户
   ```shell
   Ubuntu config --default-user root
   ```
#### 3 将linux根目录映射到win10磁盘
在win10文件地址栏输入 \\wsl$ ，可以看到已安装的wsl文件系统，如 Ubuntu
右键-映射网络驱动器，选择要映射的盘符即可。
另外注意，可以用` explorer.exe .  `命令使用windows文件资源管理器打开当前路径
#### 4 配置 terminal 打开默认路径
在 terminal 配置文件中，找到Ubuntu配置项，添加如下配置即可
startingDirectory" : "//wsl$/Ubuntu/home"
#### 5 更新镜像源
##### 1 查看具体版本 
   ```shell
   cat /etc/lsb-release
   ```
##### 2 到https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/复制最新的镜像
   阿里的支持傻瓜式操作，但经常打不开，就算了
   ```shell
    #备份：
    mv /etc/apt/sources.list /etc/apt/sources.list.backup
    #编辑：
    vi /etc/apt/sources.list
   ```
##### 3 更新
   ```shell
   apt-get update -y && apt-get upgrade -y
   ```
#### 6 配置代理
在 /etc/profile 最后加：
```shell
host_ip=$(cat /etc/resolv.conf |grep "nameserver" |cut -f 2 -d " ")
export ALL_PROXY="http://$host_ip:7890"
```
#### 7 禁止添加Windows-PATH
为了避免开发环境冲突，需关闭Windows-PATH
wsl.conf配置参考：https://docs.microsoft.com/zh-cn/windows/wsl/wsl-config
新建 /etc/wsl.conf，添加以下内容：
    ```shell
    # 不加载Windows中的PATH内容
    [interop]
    appendWindowsPath = false
    ```
### 三 IDEA开发和总结
经过测试，常规SpringBoot工程，在Windows目录下的，可以使用WSL环境进行debug、部署
对于纯maven工程，支持也还好

但对于纯gradle工程（非spring），则无法完成gradle初始化，无论工程是否是在WSL中都不行
设置JDK是WSL，但将Gradle路径指定为WSL却一直不行，说路径有问题，只能使用默认的Gradle。
根据issue的说法，建议将Windows的gradle path设置为WSL的路径，不过我没有试，我觉得这单纯就是官方的bug。
官方issue：https://youtrack.jetbrains.com/issues/IDEA?q=wsl
另外，对于WSL下工程的git，idea似乎也无法识别

总之，IDEA（2021.1）的WSL2支持尚不成熟，但是也已经初步支持，还可以自动下载、选择WSL环境的JDK
可以作为日常开发的辅助支持，但目前仍不建议全面迁移过去

对我来说，WSL的开发应用场景主要在于：
大数据功能开发：之前简单的hdfs操作都需要在windows中配置hadoop相关的环境变量，而且各种版本或兼容性问题，很麻烦，以后这些直接丢wsl里面
大数据组件编译：很多组件并不是纯Java代码，可能还需要一些脚本，这些有平台依赖性的，很可能因为windows而导致编译失败
脚本开发：在windows新建的sh脚本在拿去linux系统之前都要先转换一下格式，以后直接作为wsl系统下文件新建，就不用考虑这些乱七八糟的问题

最终目标是以后把所有的工程都迁移到wsl下，开发相关全部使用wsl环境