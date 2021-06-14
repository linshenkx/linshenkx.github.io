---
title: Ranger2.1
id: kubernetes-tls-ssl-certificates
permalink: kubernetes-tls-ssl-certificates/
date: 2020-08-27 23:55:09
categories:
- [Kubernetes]
  top: false
  tags:
- k8s
---
在k8s应用注入自签发的TLS/SSL证书有两种思路：1.使用certificates.k8s.io API 进行签发。2. 直接利用自己的CA证书进行签发。一般推荐第二种方法，本文记录了两种方法的完整实践并最后将其转换为JAVA的使用格式。
<!-- more -->

## 编译
需要linux环境，保证python命令可用，如果只装了python3，推荐apt install -y python-is-python3
apt install gcc -y

kylin2.6.4依赖calcite-linq4j-1.16.0-kylin-r2
这个jar包在外部maven仓库是找不到的，导致build失败，参考：
https://issues.apache.org/jira/browse/RANGER-2994
https://issues.apache.org/jira/browse/RANGER-2999
因为是kylin本身的依赖问题，不是ranger的锅，这里谴责一下kylin然后对其选择性放弃
放弃方法：在pom.xml将其所有的module注释掉，如下
```xml
<!--                <module>plugin-kylin</module>-->
<!--                <module>ranger-kylin-plugin-shim</module>-->
```


```log
[INFO] ------------------------------------------------------------------------
[INFO] Reactor Summary for ranger 2.1.1-SNAPSHOT:
[INFO] 
[INFO] ranger ............................................. SUCCESS [02:31 min]
[INFO] Jdbc SQL Connector ................................. SUCCESS [ 12.635 s]
[INFO] Credential Support ................................. SUCCESS [ 14.241 s]
[INFO] Audit Component .................................... SUCCESS [ 40.494 s]
[INFO] ranger-plugin-classloader .......................... SUCCESS [  8.902 s]
[INFO] Common library for Plugins ......................... SUCCESS [02:43 min]
[INFO] ranger-intg ........................................ SUCCESS [ 15.121 s]
[INFO] Installer Support Component ........................ SUCCESS [  4.590 s]
[INFO] Credential Builder ................................. SUCCESS [  7.686 s]
[INFO] Embedded Web Server Invoker ........................ SUCCESS [ 12.830 s]
[INFO] Key Management Service ............................. SUCCESS [ 52.264 s]
[INFO] HBase Security Plugin Shim ......................... SUCCESS [ 15.598 s]
[INFO] HBase Security Plugin .............................. SUCCESS [ 32.827 s]
[INFO] Hdfs Security Plugin ............................... SUCCESS [ 34.502 s]
[INFO] Hive Security Plugin ............................... SUCCESS [ 35.109 s]
[INFO] Knox Security Plugin Shim .......................... SUCCESS [ 11.906 s]
[INFO] Knox Security Plugin ............................... SUCCESS [ 49.254 s]
[INFO] Storm Security Plugin .............................. SUCCESS [ 23.171 s]
[INFO] YARN Security Plugin ............................... SUCCESS [ 16.011 s]
[INFO] Ozone Security Plugin .............................. SUCCESS [ 16.418 s]
[INFO] Ranger Util ........................................ SUCCESS [01:43 min]
[INFO] Unix Authentication Client ......................... SUCCESS [  8.165 s]
[INFO] Security Admin Web Application ..................... SUCCESS [21:33 min]
[INFO] KAFKA Security Plugin .............................. SUCCESS [ 21.139 s]
[INFO] SOLR Security Plugin ............................... SUCCESS [ 16.487 s]
[INFO] NiFi Security Plugin ............................... SUCCESS [ 18.495 s]
[INFO] NiFi Registry Security Plugin ...................... SUCCESS [ 15.196 s]
[INFO] Kudu Security Plugin ............................... SUCCESS [  9.105 s]
[INFO] Unix User Group Synchronizer ....................... SUCCESS [ 47.248 s]
[INFO] Ldap Config Check Tool ............................. SUCCESS [  8.631 s]
[INFO] Unix Authentication Service ........................ SUCCESS [  9.789 s]
[INFO] Unix Native Authenticator .......................... SUCCESS [  4.242 s]
[INFO] KMS Security Plugin ................................ SUCCESS [ 34.582 s]
[INFO] Tag Synchronizer ................................... SUCCESS [ 28.172 s]
[INFO] Hdfs Security Plugin Shim .......................... SUCCESS [  7.847 s]
[INFO] Hive Security Plugin Shim .......................... SUCCESS [ 13.040 s]
[INFO] YARN Security Plugin Shim .......................... SUCCESS [ 10.582 s]
[INFO] OZONE Security Plugin Shim ......................... SUCCESS [ 16.250 s]
[INFO] Storm Security Plugin shim ......................... SUCCESS [ 10.807 s]
[INFO] KAFKA Security Plugin Shim ......................... SUCCESS [  8.435 s]
[INFO] SOLR Security Plugin Shim .......................... SUCCESS [ 10.037 s]
[INFO] Atlas Security Plugin Shim ......................... SUCCESS [  9.938 s]
[INFO] KMS Security Plugin Shim ........................... SUCCESS [ 13.735 s]
[INFO] ranger-examples .................................... SUCCESS [  2.577 s]
[INFO] Ranger Examples - Conditions and ContextEnrichers .. SUCCESS [ 13.963 s]
[INFO] Ranger Examples - SampleApp ........................ SUCCESS [ 14.751 s]
[INFO] Ranger Examples - Ranger Plugin for SampleApp ...... SUCCESS [  9.067 s]
[INFO] sample-client ...................................... SUCCESS [ 21.965 s]
[INFO] Apache Ranger Examples Distribution ................ SUCCESS [ 17.195 s]
[INFO] Ranger Tools ....................................... SUCCESS [ 32.274 s]
[INFO] Atlas Security Plugin .............................. SUCCESS [ 15.610 s]
[INFO] SchemaRegistry Security Plugin ..................... SUCCESS [ 33.643 s]
[INFO] Sqoop Security Plugin .............................. SUCCESS [ 32.979 s]
[INFO] Sqoop Security Plugin Shim ......................... SUCCESS [  8.851 s]
[INFO] Presto Security Plugin ............................. SUCCESS [ 36.558 s]
[INFO] Presto Security Plugin Shim ........................ SUCCESS [01:06 min]
[INFO] Elasticsearch Security Plugin Shim ................. SUCCESS [ 14.989 s]
[INFO] Elasticsearch Security Plugin ...................... SUCCESS [ 13.180 s]
[INFO] Apache Ranger Distribution ......................... SUCCESS [38:46 min]
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  01:24 h
[INFO] Finished at: 2021-05-27T15:47:58+08:00
[INFO] ------------------------------------------------------------------------
```