---
title: CDH部署笔记
id: cdh_server_env_deploy
permalink: cdh_server_env_deploy/
date: 2020-10-28 00:29:54
categories: 大数据
top: false
tags:  
   - CDH
---
本文为个人安装CDH时记录，不具普适性，仅供参考。建议对比官方文档阅读。
<!-- more -->
## 一 依赖检查
以centos7为例
### 1. 软件
https://docs.cloudera.com/documentation/enterprise/6/release-notes/topics/rg_os_requirements.html
#### 0. 常用软件安装
此步骤非必须
```shell
yum install -y bind-utils
```

#### 1. python
使用2.7版本或以上版本，但不支持3
centos7 中默认已包含，如果有多版本需设置PYSPARK_PYTHON和
PYSPARK_DRIVER_PYTHON环境变量
```shell
# 查看版本
python --version
```
#### 2. Perl
一般已安装
```shell
# 查看版本
perl -v
```
#### 3. python-psycopg2
```shell
# 要先安装epel-release，，这个包包含了 EPEL 源的 gpg 密钥和软件源信息，该软件包会自动配置yum的软件仓库
# 否则下一步会提示：没有可用软件包 pip-python
yum -y install epel-release
# 安装pip
yum -y install python-pip
# 使用pip 安装 psycopg2
pip install psycopg2==2.7.5 --ignore-installed
```

### 2. 网络
#### 禁用ipv6
https://www.jianshu.com/p/225d040d0b66
```shell
sysctl -w net.ipv6.conf.all.disable_ipv6=1
sysctl -w net.ipv6.conf.default.disable_ipv6=1
```
```shell
reboot
netstat -lnpt
```
#### 配置hostname
https://docs.cloudera.com/documentation/enterprise/6/latest/topics/configure_network_names.html
用全称域名，如：paas-201.adp.com 而不是 paas-201
1. 配置hostname
```shell
sudo hostnamectl set-hostname foo-1.example.com

```
2. 编辑/ets/hosts(集群统一)
```
1.1.1.1  foo-1.example.com  foo-1
2.2.2.2  foo-2.example.com  foo-2
3.3.3.3  foo-3.example.com  foo-3
4.4.4.4  foo-4.example.com  foo-4
```
3. 编辑/etc/sysconfig/network
```shell
echo "HOSTNAME=$HOSTNAME" >>/etc/sysconfig/network

```
#### 关闭防火墙
```shell
# 保存规则
sudo iptables-save > ~/firewall.rules
# 关闭
sudo systemctl disable firewalld
sudo systemctl stop firewalld
```
### 3. 关闭SELinux
查看是否已经关闭
```shell
getenforce
```
关闭方法：
修改/etc/selinux/config
SELINUX=permissive
并执行 setenforce 0  立即生效
### 4. 启用ntp
安装后用以下命令进行验证
```shell
systemctl status chronyd.service 
chronyc sources -v 
chronyc sourcestats -v
```
## 二 安装
### 一. 配置本地仓库
https://docs.cloudera.com/documentation/enterprise/6/latest/topics/cm_ig_create_local_package_repo.html
#### 1. 配置web服务器
1. 安装
```shell
sudo yum install httpd

```
需保证/var/www磁盘空间足够，建议挂载，这里假设 /home/www 有足够的空间
```shell
mv /var/www /var/www2
mkdir /home/www
ln -s /home/www /var/www
mv /var/www2/* /var/www/
rm -rf /var/www2
ls /home/www
```

2. 启动
```shell
sudo systemctl start httpd

```
#### 2. 下载文件(clouderaManager和cdh）
1. clouderaManager
   下载：https://archive.cloudera.com/cm6/6.3.1/repo-as-tarball/cm6.3.1-redhat7.tar.gz

```shell
sudo mkdir -p /var/www/html/cloudera-repos/cm6
tar xvfz cm6.3.1-redhat7.tar.gz -C /var/www/html/cloudera-repos/cm6 --strip-components=1
sudo chmod -R ugo+rX /var/www/html/cloudera-repos/cm6
```
2. cdh

```shell
sudo mkdir -p /var/www/html/cloudera-repos
sudo wget --recursive --no-parent --no-host-directories https://archive.cloudera.com/cdh6/6.3.2/redhat7/ -P /var/www/html/cloudera-repos

sudo wget --recursive --no-parent --no-host-directories https://archive.cloudera.com/gplextras6/6.3.2/redhat7/ -P /var/www/html/cloudera-repos

sudo chmod -R ugo+rX /var/www/html/cloudera-repos/cdh6
sudo chmod -R ugo+rX /var/www/html/cloudera-repos/gplextras6
```

访问 http://<host>/cloudera-repos/ ，应该可以看到下载的文件
#### 3. 配置使用本地存储库
创建/etc/yum.repos.d/cloudera-repo.repo
内容如下：

[cloudera-repo]
name=cloudera-repo
baseurl=http://paas-241/cloudera-repos/cm6
enabled=1
gpgcheck=0



### 三. 安装CDH
#### 1. 安装java
 ```shell
 yum install -y oracle-j2sdk1.8
```
#### 2. 安装CM
```shell
yum install -y cloudera-manager-daemons cloudera-manager-agent cloudera-manager-server
```

#### 3. 安装数据库
假设使用mysql且已安装

在cm服务器上：

##### 1. 安装jdbc驱动
```shell
wget https://dev.mysql.com/get/Downloads/Connector-J/mysql-connector-java-5.1.46.tar.gz

tar zxvf mysql-connector-java-5.1.46.tar.gz

sudo mkdir -p /usr/share/java/

cd mysql-connector-java-5.1.46

sudo cp mysql-connector-java-5.1.46-bin.jar  /usr/share/java/mysql-connector-java.jar

```
##### 2. 创建数据库并授权
登录mysql进行配置：
```shell
 mysql -u root -h 192.168.100.200 -p

```
执行以下命令：假设数据库为cdh 授权用户为root，密码为anyonedev
 ```sql
CREATE DATABASE cdh DEFAULT CHARACTER SET utf8 DEFAULT COLLATE utf8_general_ci;
GRANT ALL ON cdh.* TO 'root'@'%' IDENTIFIED BY 'anyonedev';
SHOW DATABASES;
SHOW GRANTS FOR 'root'@'%';

```
##### 3. 执行创建脚本
```shell

/opt/cloudera/cm/schema/scm_prepare_database.sh -h 192.168.100.200 mysql cdh root anyonedev

```
#### 四 启动

 ```shell
sudo systemctl enable cloudera-scm-server
sudo systemctl start cloudera-scm-server
sudo tail -f /var/log/cloudera-scm-server/cloudera-scm-server.log

```
直到看到：
INFO WebServerImpl:com.cloudera.server.cmf.WebServerImpl: Started Jetty server.
则说明启动完成，打开
http://paas-241:7180 即可 admin/admin

注意配置自定义仓库：
http://192.168.100.241/cloudera-repos/cdh6/6.3.2/redhat7/yum/
方法是数据表