---
title: oracle_logminer学习和实践笔记
date: 2020-09-24 17:03:16
categories: 后端开发
top: false
tags:
- oracle
- logminer
---
Oracle LogMiner是Oracle公司从产品8i以后提供的一个实际非常有用的分析工具，使用该工具可以轻松获得Oracle 在线/归档日志文件中的具体内容，特别是该工具可以分析出所有对于数据库操作的DML和DDL语句。该工具特别适用于调试、审计或者回退某个特定的事务。
<!-- more -->
## 一 搭建环境
### 1 使用docker提供oracle运行环境
```shell
docker run -d --name my-oracle --restart=always -p 49161:1521 -e ORACLE_ALLOW_REMOTE=true wnameless/oracle-xe-11g-r2
```
连接配置如下：
>hostname: localhost
port: 49161
sid: xe
username: system  管理员：sys as sysdba
password: oracle

以下操作需在sql plus环境下执行
>navicat 配置sql plus方法如下：
到 https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html 下载对应版本的 Instant Client Package - Basic 基础安装包 和 Instant Client Package - SQL*Plus，解压到同一目录，在navicat - 选项 - 环境 里配置该目录即可

不过还是建议直接到容器里面执行
```shell
# 进入容器
docker exec -it my-oracle bash
# 以系统管理员登录sqlplus
sqlplus sys/oracle as sysdba
```
也可以创建一个系统管理员，如下，其中"CONNECT", "DBA", "RESOURCE"是角色，SYSDBA 是服务器权限，不能同时grant
```sql
CREATE USER "LOGMINER01" IDENTIFIED BY "123456";

GRANT "CONNECT", "DBA", "RESOURCE" TO "LOGMINER01";

GRANT SYSDBA  TO "LOGMINER01";
```

### 2 加入功能包
通常在安装数据库后就已经安装了Logminer，要查看数据库是否安装了LogMiner，只需查看数据库中是否已经有了dbms_logmnr和dbms_logmnr_d这2个package，如果有了，则已经安装，如果没有，执行下面两个脚本即可
```shell
@/u01/app/oracle/product/11.2.0/xe/rdbms/admin/dbmslm.sql
@/u01/app/oracle/product/11.2.0/xe/rdbms/admin/dbmslmd.sql

```
如果环境不一样，不知道对应的文件位置，建议直接 find / -name 'dbmslm.sql'
![加入功能包](https://img-blog.csdnimg.cn/20200917224107575.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)

### 3 启用补充日志
补充日志有几种类型，SUPPLEMENTAL LOG DATA是最小补充日志，这里推荐使用SUPPLEMENTAL LOG DATA (ALL) COLUMNS，当数据行更新时会记录完整的字段数据（而非只有更新的字段数据）
```sql
-- 最小补充日志
-- ALTER DATABASE ADD SUPPLEMENTAL LOG DATA;
ALTER DATABASE ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
SELECT SUPPLEMENTAL_LOG_DATA_MIN FROM V$DATABASE;

```
![启用补充日志](https://img-blog.csdnimg.cn/20200917225120914.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)

### 4 开启archivelog mode
```shell
SHUTDOWN IMMEDIATE
STARTUP MOUNT
ALTER DATABASE ARCHIVELOG;
ALTER DATABASE OPEN;
archive log list;

```
![开启archivelog mode](https://img-blog.csdnimg.cn/20200917225424282.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)
### 5 创建日常维护账号
需要注意，最后的 ALTER system 权限过大，如果不需要使用alter system switch logfile语句的，可以不授权。
alter system switch  logfile 的具体说明参考：https://blog.csdn.net/fred_yang2013/article/details/45171283

```sql
-- 创建user1用户
CREATE USER "USER1" IDENTIFIED BY "123456";
-- 授予 连接 权限
GRANT "CONNECT","RESOURCE" TO "USER1";
-- 授予 使用LogMiner PL / SQL程序包 权限
GRANT EXECUTE_CATALOG_ROLE TO "USER1";
-- 授予 查询V$ARCHIVED_LOG视图 权限
GRANT SELECT ON	V_$ARCHIVED_LOG TO "USER1";
-- 授予 使用DBMS_LOGMNR_D程序 权限（用于生成字典文件）
GRANT execute ON DBMS_LOGMNR_D TO "USER1";
-- 授予 使用DBMS_LOGMNR程序 权限 （用于生成分析会话）
GRANT execute ON DBMS_LOGMNR TO "USER1";
-- 授予 查询V$LOGMNR_CONTENTS TO视图 权限（必须拥有SELECT ANY TRANSACTION权限才能查询此视图）
GRANT SELECT ANY TRANSACTION TO USER1;
GRANT SELECT ON	V_$LOGMNR_CONTENTS TO "USER1";
-- 授予 执行alter system switch logfile生成日志文件 权限
GRANT ALTER system TO "USER1";


```
## 二 常用命令
### 1 查看日志文件
```sql
SELECT * FROM V$ARCHIVED_LOG ;
```
### 2 创建字典文件
```sql
BEGIN
    DBMS_LOGMNR_D.BUILD(OPTIONS=> DBMS_LOGMNR_D.STORE_IN_REDO_LOGS);
end;

```
### 3 创建归档日志
```sql
alter system switch logfile
```
## 三 使用示例
      0. 先执行归档操作
      1. 根据给定范围，获取要分析的文件列表
      2. 先生成字典，再根据1，选定最近的字典.字典可能有多文件，需找出最后一个
       2.0 生成字典文件
       2.1 根据1的文件找出1之前最近的一个字典结束文件
       2.2 根据2.1文件找出2.1之前最近的一个字典开始文件
      3. 全部加入要分析的文件列表中
      4. 执行分析
### 0 归档
```sql
alter system switch logfile
```
### 1 获取要分析的文件列表
如下，可以根据scn序号范围或者时间范围获取归档文件列表。
这里可以限制待会要分析的文件数量，减少服务器工作量。
```sql
SELECT recid , stamp , name , sequence# as sequence, next_change# as nextChange,next_time as nextTime,completion_time as completionTime ,dictionary_begin as dictionaryBegin,dictionary_end as dictionaryEnd
	FROM V$ARCHIVED_LOG 
WHERE NEXT_CHANGE# >= ${beginScn?c} AND
FIRST_CHANGE# <= ${endScn?c} AND
NEXT_TIME >= to_date('${beginTime}','YYYYMMDDHH24MISS') AND
FIRST_TIME <= to_date('${endTime}','YYYYMMDDHH24MISS') AND
1 = 1
```
### 2 选择字典文件
这一步参考：https://docs.oracle.com/en/database/oracle/oracle-database/12.2/sutil/oracle-logminer-utility.html#GUID-90944343-46BB-4BD5-A0C6-7A4B79D9BEF0

#### 2.0. 生成字典文件
这一步非必要，个人习惯，每次多生成一份字典文件
```sql
BEGIN
    DBMS_LOGMNR_D.BUILD(OPTIONS=> DBMS_LOGMNR_D.STORE_IN_REDO_LOGS);
end;
```
#### 2.1 根据1的文件找出1之前最近的一个字典结束文件
将${minSequence?c}替换成第1步获取到的分析文件列表中最小的的sequence
```sql
SELECT recid , stamp , name , sequence# sequence, next_change# as nextChange,next_time as nextTime,completion_time as completionTime ,dictionary_begin as dictionaryBegin,dictionary_end as dictionaryEnd
	FROM V$ARCHIVED_LOG
WHERE SEQUENCE# = (
	SELECT MAX (SEQUENCE#) FROM V$ARCHIVED_LOG
	WHERE DICTIONARY_END = 'YES'
	and SEQUENCE# <= ${minSequence?c} )
```
注意，如果这一步没有符合条件的数据，说明分析的范围之前没有字典文件生成，这里我的处理方法是直接把子查询改成查最远的一个字典文件：
```sql
SELECT MIN (SEQUENCE#) FROM V$ARCHIVED_LOG 
	WHERE DICTIONARY_END = 'YES'
```
#### 2.2 根据2.1文件找出2.1之前最近的一个字典开始文件
将${minSequence?c}替换成2.1找出的那个字典结束文件的序号
```sql
SELECT recid , stamp , name , sequence# sequence, next_change# as nextChange,next_time as nextTime,completion_time as completionTime ,dictionary_begin as dictionaryBegin,dictionary_end as dictionaryEnd
	FROM V$ARCHIVED_LOG
WHERE SEQUENCE# = (
	SELECT MAX (SEQUENCE#) FROM V$ARCHIVED_LOG
		WHERE DICTIONARY_BEGIN = 'YES'
		and SEQUENCE# <= ${minSequence?c} )
```

### 3. 全部加入要分析的文件列表中
把1、2找到的文件都丢进去分析列表中
这里用freemarker语法表达如下
```sql
BEGIN
<#list logFileNameSet as logFile>
   DBMS_LOGMNR.ADD_LOGFILE(LOGFILENAME => '${logFile}'<#if logFile_index==0>,OPTIONS => DBMS_LOGMNR.NEW</#if>);
</#list>
END;
```
### 4. 启动logminer
直接开始即可
```sql
BEGIN
	DBMS_LOGMNR.START_LOGMNR ( OPTIONS => 	DBMS_LOGMNR.DICT_FROM_REDO_LOGS );
END;

```
### 5. 从视图中查询
如下，从v$logmnr_contents 中查询
```sql
select * from v$logmnr_contents where TABLE_NAME=? order by SCN asc
```
### 6. 退出logminer
每次分析只对当前会话有效，会话关闭后自动退出logminer。建议手动关闭
```sql
BEGIN
	DBMS_LOGMNR.END_LOGMNR();
END;
```