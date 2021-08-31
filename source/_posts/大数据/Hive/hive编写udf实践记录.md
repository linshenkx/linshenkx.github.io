---
title: hive编写udf实践记录
id: hive_udf
permalink: hive_udf/
date: 2020-11-10 23:47:22
categories: 大数据
top: false
tags:
- hive
---
官方教程：https://cwiki.apache.org/confluence/display/Hive/HivePlugins
简单使用查看上面官方的文档即可。这里记录一下我使用的实践和一点注意事项。
<!-- more -->
## 一 编写udf
这里的需求是写一个udf，用于将经纬度转换成geohash。参数有 经纬度和geohash的精度。

### gradle配置
gradle 部分配置如下：
```gradle
dependencies {
    compile group: 'ch.hsr', name: 'geohash', version: '1.3.0'
    compileOnly group: 'org.apache.hive', name: 'hive-exec', version: '2.3.6'
}

task fatJar(type: Jar) {
    //baseName = project.name
    baseName = 'hiveFunction'
    project.fileTree("$buildDir/fatjar/libs").forEach { jarFile ->
        from zipTree(jarFile )
    }
    with jar
    destinationDir = file("$buildDir/fatjar")
}

task copyToLib(type: Copy) {
    into "$buildDir/fatjar/libs"
    from configurations.runtime
}
```

### UDF类
GeoHashUDF.java 代码如下：
这里需要注意的就是注释的写法，以及异常的处理。
因为在hive执行的过程中，如果udf抛一个异常出来，有可能会导致整个hive sql执行的失败。所以，对于业务异常，应该避免向外抛出。
以本geohash的udf为例，如果给定的经纬度不合法，则可返回用0填充的默认字符串。

```java
import ch.hsr.geohash.GeoHash;
import org.apache.hadoop.hive.ql.exec.Description;
import org.apache.hadoop.hive.ql.exec.UDF;

import java.util.HashMap;
import java.util.Map;

@Description(
        name = "geohash",
        value = "_FUNC_(double lat,double lon,int precison) - Returns geohash",
        extended = "Example:\n  > SELECT _FUNC_(\'20.1,111.2,6\') FROM src LIMIT 1;\n  \'hello:Facebook\'"
)
public class GeoHashUDF extends UDF {

    private static Map<Integer,String> defaultValueMap = new HashMap<> ();

    static {
        StringBuilder sb = new StringBuilder("");
        for(int i = 0; i < 20; i++){
            defaultValueMap.put(i,sb.toString());
            sb.append(0);
        }
    }

    public String evaluate (Double lat,Double lon,Integer precision) {
        try {
            return GeoHash.geoHashStringWithCharacterPrecision(lat, lon, precision);
        }catch (Exception e) {
            return defaultValueMap.get(precision);
        }
    }

    public static void main(String[] args) {
        System.out.println(new GeoHashUDF().evaluate(20.1,111.2,6));
    }

}


```
### 打jar包
先执行gradle copyToLib，再执行 gradle  fatJar
得到 hiveFunction.jar
## 二 创建function
### 1 创建临时function
1. 先将生成的jar包添加到hive的lib目录下
```shell
\cp -f hiveFunction.jar $HIVE_HOME/lib/

```
2. 再在hive shell里面执行以下命令即可，注意要使用全称类名
```shell
create temporary function geohash as 'GeoHashUDF';

```
3. 删除
```shell
drop temporary function if exists geohash;

```
### 2 创建永久function
1. 上传jar包到hdfs上
```shell script
hadoop fs -rm /my/hive/libs/hiveFunction.jar
hadoop fs -put hiveFunction.jar /my/hive/libs/hiveFunction.jar
```
2. 创建永久函数
```shell script
create function geohash as 'com.yaoyun.anyonedev.hive.function.GeoHashUDF' using jar 'hdfs:///my/hive/libs/hiveFunction.jar';

```
3. 删除
```shell
drop function if exists geohash;

```
