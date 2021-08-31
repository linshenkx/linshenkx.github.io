---
title: HBCK2修复RIT实践笔记
id: hbck2_rit
permalink: hbck2_rit/
date: 2020-04-16 01:40:39
categories: 
   - [大数据,HBASE]
   - [bug]
top: false
tags:
   - 'hbase'
   - "debug"
---
本文记录了作者使用HBCK2工具对线上HBase发生RIT状态的处理，仅供参考，若有疵漏，还望指正。
网络上关于HBCK2的文章很少，基本都是复制粘贴自田竞云(小米)的这一篇：[HBase指南 | HBase 2.0之修复工具HBCK2运维指南](https://mp.weixin.qq.com/s/GVMWwB1WsKcdvZGfvX1lcA?spm=a2c4e.11153940.blogcont683107.11.49d762a815MegW)
事实上这一篇文章介绍得也已经很详细了。这里只是做一些实践上的补充说明。
<!-- more -->
### 1. 下载
直接去[hbase的官网下载地址](https://hbase.apache.org/downloads.html)里就可以找到。这里直接给最新版本的下载链接（截止至2020年4月）：https://downloads.apache.org/hbase/hbase-operator-tools-1.0.0/hbase-operator-tools-1.0.0-bin.tar.gz
但还是推荐自己去git clone编译，因为官网提供的编译版本有滞后性。通常来说，使用最新版本的hbase再搭配使用最新编译的HBCK2,可以解决绝大部分莫名其妙的问题。（fixMeta+restart暴力流）
新版本的HBCK2有更多更方便的功能，不过一般只能在新版本的hbase中使用。
### 2. 使用命令
将其解压后得到 hbase-hbck2-1.0.0.jar，再cp到$HBASE_HOME/lib下，执行  ***hbase org.apache.hbase.HBCK2 <命令>***  即可，第一次使用推荐  ***hbase org.apache.hbase.HBCK2  -h*** 查看详细介绍
##  使用方法
### 1. 查找问题
参考HBCK2运维指南的思路：
```mermaid
graph LR
A(canary tool)--> B(Procedures & Locks 页面状态)
B --> C(RIT队列)
C --> D(Master日志)
```
### 2. 实践例子
1. 处理Procedures & Locks
   在 Procedures & Locks 页面查找waiting状态的procedure，按顺序进行bypass。按顺序是因为有一些waiting的发生是procedure存在依赖关系，将其bypass后后面的procedure会进入success状态。如果bypass返回false就使用bypass -r，还是不行再使用bypass -or
2. 处理RIT队列
   参考HBCK2运维指南可以以txt格式拿到RIT队列的所有procedure的id，将其复制到任意文件（如pid.txt），再执行以下命令即可
   ```	shell
   cat pid.txt | xargs hbase org.apache.hbase.HBCK2 bypass -or 
   ```
   然后再以txt格式拿到RIT队列的所有region的encodedName，将其复制到任意文件（如region.txt），再执行以下命令即可
   ```shell
   cat region.txt | xargs hbase org.apache.hbase.HBCK2 assigns
   ```
3. assign各个表中offline的region
   检查一下各个表中是否有region的StorefileSize为0，当然也可能是本身没有存储多少数据，要注意辨别。这种一般对其assigns就可以了。
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20200416012024639.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)

   对于一些大表可能有上千个region的，一个个甄选未免太浪费时间，可以直接在web界面将其region区域全部拷贝下来，复制到txt，使用下述命令进行筛选
   ```shell
   cat regions.txt |grep -v 'GB' |grep -v 'MB' > region2.txt
   ```
4. 高版本的hbase有hbck记录页，去页面查看，根据提醒操作就行，更方便
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20201214142116129.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)

   使用以下Java代码即可提取出encodedName
   ```java
   @Test
   public void printRegionEncodedName() throws IOException {
       List<String> lines = FileUtil.readUtf8Lines("C:\\tmp\\region2.txt");
       List<String> regionEncodedNameList= Lists.newArrayListWithExpectedSize(lines.size());
       for (String line : lines) {
           if(StringUtils.isBlank(line)){
               continue;
           }
           int point1=line.indexOf(".") ;
           int point2=line.indexOf(".", line.indexOf(".")+1);
           String s = line.substring(point1+1, point2);
           System.out.println(s);
           regionEncodedNameList.add(s);
       }
       System.out.println("size:"+regionEncodedNameList.size());
       try (PrintWriter pw = new PrintWriter(new FileWriter("C:\\tmp\\encodedName.txt"));){
           regionEncodedNameList.forEach(regionEncodedName->pw.println(regionEncodedName+" "));
       }
   }
   ```
   然后又是 ***cat encodedName.txt | xargs hbase org.apache.hbase.HBCK2 assigns*** 就可以了
   如下，一次性对大量region进行操作
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20201214141729730.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)

### 3. 注意事项
对procedure执行bypass后其状态会由waiting转换为success(bypassed)，但不会立即移除出rit队列。可通过重启master解决。
	    