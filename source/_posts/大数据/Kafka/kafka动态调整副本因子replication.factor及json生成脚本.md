---
title: kafka动态调整副本因子replication.factor及json生成脚本
id: kafka_replication_factor
permalink: kafka_replication_factor/
date: 2020-08-19 09:54:58
categories: 大数据
top: false
tags:
- kafka
---
kafka默认的副本因子default.replication.factor是1，即无额外副本，如果在创建topic时没有指定副本数，则无高可用性。
<!-- more -->
### 1. 说明
kafka默认的副本因子default.replication.factor是1，即无额外副本，如果在创建topic时没有指定副本数，则无高可用性。该参数在topic创建时生效，topic创建后无法直接对topic级别的副本数进行修改，但官方提供了在partition级别增加副本数的功能，用于集群添加节点的情况。
详情参考官方文档：https://kafka.apache.org/documentation/#basic_ops_increase_replication_factor

简单来说就是使用json文件描述该topic每一个partition的情况，每一个partition包含副本分布的描述。然后使用 kafka-reassign-partitions.sh 执行安装json文件完成再分配任务即可。

### 2. json生成脚本
这里提供json的生成脚本，参考自：https://github.com/dkurzaj/generate-kafka-replication-factor-json/blob/master/generate-kafka-replication-factor-json.sh

其中BROKER_IDS为要分配的brokerId,
NUMBER_OF_PARTITIONS为topic分区数
```shell
BROKER_IDS=(1 2 3)
NUMBER_OF_PARTITIONS=5
TOPIC_NAME=__consumer_offsets

output_file="increase-rf-json/increase-replication-factor-"${TOPIC_NAME}".json"

# Beginning of the file
echo '{"version":1,' > $output_file
echo '  "partitions":[' >> $output_file

current_broker_id_index=0

# Responsible for the circular array over the brokers IDs
set_next_broker(){
    current_broker_id_index=$1
    current_broker_id_index=$(($current_broker_id_index + 1))
    current_broker_id_index=$(($current_broker_id_index % ${#BROKER_IDS[@]}))
    return $current_broker_id_index
}

# Forges the string containing the replicas brokers of a partition
get_brokers_string(){
    current_broker_id_index=$1
    brokers_string="${BROKER_IDS[$current_broker_id_index]}"
    set_next_broker $current_broker_id_index
    current_broker_id_index=$?
    brokers_string="$brokers_string,${BROKER_IDS[$current_broker_id_index]}"
    set_next_broker $current_broker_id_index
    current_broker_id_index=$?
    brokers_string="$brokers_string,${BROKER_IDS[$current_broker_id_index]}"
    set_next_broker $current_broker_id_index
    current_broker_id_index=$?
    echo $brokers_string
    return $current_broker_id_index
}

# Create all the lines
partition_number=0
while (("$partition_number" < "$NUMBER_OF_PARTITIONS-1")); do
    brokers_string=$(get_brokers_string $current_broker_id_index)
    current_broker_id_index=$?
    echo "    {\"topic\":\"$TOPIC_NAME\",\"partition\":$partition_number,\"replicas\":[$brokers_string]}," >> $output_file
    partition_number=$(($partition_number + 1))
done

# Last line without trailing coma
brokers_string=$(get_brokers_string $current_broker_id_index)
echo "    {\"topic\":\"$TOPIC_NAME\",\"partition\":$partition_number,\"replicas\":[$brokers_string]}" >> $output_file

# End of the file
echo ']}' >> $output_file

exit 0

```
生成json内容如下：
可以看到这个文件本质上是对partition而非topic的描述
```json
{"version":1,
  "partitions":[
    {"topic":"__consumer_offsets","partition":0,"replicas":[1,2,3]},
    {"topic":"__consumer_offsets","partition":1,"replicas":[1,2,3]},
    {"topic":"__consumer_offsets","partition":2,"replicas":[1,2,3]},
    {"topic":"__consumer_offsets","partition":3,"replicas":[1,2,3]},
    {"topic":"__consumer_offsets","partition":4,"replicas":[1,2,3]}
]}

```
### 3. 例子
生成后执行命令格式如下（也可使用zookeeper代替bootstrap-server）
```shell
bin/kafka-reassign-partitions.sh --bootstrap-server localhost:9092 --reassignment-json-file increase-replication-factor.json --execute
```
实例（有50个partition）：
![execute](https://img-blog.csdnimg.cn/20200819094107721.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)

使用verify代替execute即可查看执行进度
![verify](https://img-blog.csdnimg.cn/20200819094400579.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70#pic_center)
### 4. 改进方向
目前的shell脚本生成的partition副本分布固定为 BROKER_IDS ，适用于节点数和副本数相同的情况，如果有10节点而只要3副本就不行，生成的json会使副本集中的3个节点。
不过一般还是建议修改默认副本数或者创建topic时执行副本数而非使用这个脚本，如果是集群添加节点的情况，建议还是使用专业的带负载平衡功能的kafka管理系统。
### 5. 建议设置参数
```shell
    offsets.topic.replication.factor=3
    transaction.state.log.replication.factor=3
    transaction.state.log.min.isr=3
    default.replication.factor=3

```

