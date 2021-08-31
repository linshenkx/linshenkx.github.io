---
title: 空间索引 S2 学习指南及Java工具类实践
id: google_spatial_search_s2
permalink: google_spatial_search_s2/
date: 2020-04-29 01:23:21
categories: 后端开发
top: false
tags:
- s2
---
geohash对于大区域查询表现极不良好，经调研测试，改用google的s2。因为涉及的资料、工具较多，特此记录，以备后用。
<!-- more -->
## 一 学习指南
### 0 介绍说明
班门不弄斧，这里推荐 halfrost 大神的空间搜索系列文章，推荐先浏览一遍。
这一篇是对S2的概念介绍：[高效的多维空间点索引算法 — Geohash 和 Google S2](https://github.com/halfrost/Halfrost-Field/blob/master/contents/Go/go_spatial_search.md)
这一篇是对S2里面的各个组件的介绍：[Google S2 是如何解决空间覆盖最优解问题的?](https://github.com/halfrost/Halfrost-Field/blob/master/contents/Go/go_s2_regionCoverer.md)

### 1 s2 对比 geohash 的优点
1. s2有30级，geohash只有12级。s2的层级变化较平缓，方便选择。
2. s2功能强大，解决了向量计算，面积计算，多边形覆盖，距离计算等问题，减少了开发工作量。
3. ***s2解决了多边形覆盖问题***。个人认为这是其与geohash功能上最本质的不同。给定不规则范围，s2可以计算出一个多边形近似覆盖这个范围。其覆盖用的格子数量根据精确度可控。geohash在这方面十分不友好，划定一个大一点的区域，其格子数可能达到数千，若减少格子数则丢失精度，查询区域过大。
   如下，在min level和max level不变的情况下，只需设置可接受的max cells数值，即可控制覆盖精度。而且其cell的region大小自动适配。geohash要在如此大范围实现高精度覆盖则会产生极为庞大的网格数。
   另外需要注意的是,在minLevel,maxLevel,maxCells这3个参数中,不一定能完全满足.一般而言是优先满足maxLevel即最精细的网格大小,再尽可能控制cell数量在maxCells里面.而minLevel由于会合并网格,所以很难满足(在查询大区域的时候可能会出现一个大网格和很多个小网格,导致木桶效应.这个时候可能将大网格划分为指定等级的小网格,即最终效果为,严格遵循minLevel和maxLevel,为此牺牲maxCells,后面有代码)
   ![max cells 为10](https://img-blog.csdnimg.cn/20200429231333130.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   ![max cells 为45](https://img-blog.csdnimg.cn/20200429231612572.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
### 2 精度表

| level | min area |  max area  |average area  |units  |Random cell 1 (UK) min edge length  |Random cell 1 (UK) max edge length  |Random cell 2 (US) min edge length |Random cell 2 (US) max edge length|Number of cells |
|:-------------: |:-------------:| :-----:| :-----:| :-----:| :-----:| :-----:| :-----:| :-----:| :-----:|
|00	|85011012.19	|85011012.19	|85011012.19	|km2	 	|7842 km	|7842 km	 |	7842 km	|7842 km	|6|
|01	|21252753.05	|21252753.05	|21252753.05	|km2	 	|3921 km	|5004 km	 	|3921 km	|5004 km	|24|
|02	|4919708.23	|6026521.16	|5313188.26	|km2	 	|1825 km	|2489 km	 	|1825 km	|2489 km	|96|
|03	|1055377.48	|1646455.50	|1328297.07	|km2	 |	840 km	|1167 km	 	|1130 km	|1310 km	|384|
|04	|231564.06	|413918.15	|332074.27	|km2	 	|432 km	|609 km	 	|579 km	|636 km	|1536|
|05	|53798.67	|104297.91	|83018.57	|km2	 	|210 km	|298 km	 	|287 km	|315 km	|6K|
|06	|12948.81	|26113.30	|20754.64	|km2	 	|108 km	|151 km	 |	143 km	|156 km	|24K|
|07	|3175.44	|6529.09	|5188.66	|km2	 	|54 km	|76 km	 	|72 km	|78 km	|98K|
|08	|786.20	|1632.45	|1297.17	|km2	 	|27 km	|38 km	 	|36 km	|39 km	|393K|
|09	|195.59	|408.12	|324.29	|km2	 	|14 km	|19 km	 |	18 km	|20 km	|1573K|
|10	|48.78	|102.03	|81.07	|km2	 	|7 km	|9 km	 	|9 km	|10 km	|6M|
|11	|12.18	|25.51	|20.27	|km2	 	|3 km	|5 km	 	|4 km	|5 km	|25M|
|12	|3.04	|6.38	|5.07	|km2	 	|1699 m	|2 km	 	|2 km	|2 km	|100M|
|13	|0.76	|1.59	|1.27	|km2	 	|850 m	|1185 m	 	|1123 m	|1225 m	|402M|
|14	|0.19	|0.40	|0.32	|km2	 	|425 m	|593 m	 	|562 m	|613 m	|1610M|
|15	|47520.30	|99638.93	|79172.67	|m2	 	|212 m	|296 m	 	|281 m	|306 m	|6B|
|16	|11880.08	|24909.73	|19793.17	|m2	 	|106 m	|148 m	 	|140 m	|153 m	|25B|
|17	|2970.02	|6227.43	|4948.29	|m2	 	|53 m	|74 m	 	|70 m	|77 m	|103B|
|18	|742.50	|1556.86	|1237.07	|m2	 	|27 m	|37 m	 	|35 m	|38 m	|412B|
|19	|185.63	|389.21	|309.27	|m2	 	|13 m	|19 m	 	|18 m	|19 m	|1649B|
|20	|46.41	|97.30	|77.32	|m2	 	|7 m	|9 m	 	|9 m	|10 m	|7T|
|21	|11.60	|24.33	|19.33	|m2	 	|3 m	|5 m	 	|4 m	|5 m	|26T|
|22	|2.90	|6.08	|4.83	|m2	 	|166 cm	|2 m	 	|2 m	|2 m	|105T|
|23	|0.73	|1.52	|1.21	|m2	 	|83 cm	|116 cm	 	|110 cm	|120 cm	|422T|
|24	|0.18	|0.38	|0.30	|m2	 	|41 cm	|58 cm	 	|55 cm	|60 cm	|1689T|
|25	|453.19	|950.23	|755.05	|cm2	 	|21 cm	|29 cm	 	|27 cm	|30 cm	|7e15|
|26	|113.30	|237.56	|188.76	|cm2	 	|10 cm	|14 cm	 	|14 cm	|15 cm	|27e15|
|27	|28.32	|59.39	|47.19	|cm2	 	|5 cm	|7 cm	 	|7 cm	|7 cm	|108e15|
|28	|7.08	|14.85	|11.80	|cm2	 	|2 cm	|4 cm	 	|3 cm	|4 cm	|432e15|
|29	|1.77	|3.71	|2.95	|cm2	 	|12 mm	|18 mm	 	|17 mm	|18 mm	|1729e15|
|30	|0.44	|0.93	|0.74	|cm2	 	|6 mm	|9 mm	 	|8 mm	|9 mm	|7e18|

### 3 相关资料
1. halfrost 的 git 仓库，包含空间搜索系列文章：https://github.com/halfrost/Halfrost-Field
2. s2 官网：https://s2geometry.io
3. s2 地图/可视化工具（功能强大，强烈推荐）： http://s2.sidewalklabs.com/regioncoverer/
4. 经纬度画圆/画矩形 地图/可视化工具 ：https://www.mapdevelopers.com/draw-circle-tool.php
5. 经纬度画多边形 地图/可视化工具 ：http://apps.headwallphotonics.com
6. csdn参考文章：Google S2 常用操作 ：https://blog.csdn.net/deng0515001/article/details/88031153

## 二 工具类及测试
### 工具类
#### 说明
以下是个人使用的Java工具类，持有对象S2RegionCoverer（用于获取给定区域的cellId），用于操作3种常见区域类型（圆，矩形，多边形）。支持多种传参（ch.hsr.geohash的WGS84Point传递经纬度，或者Tuple工具类传递经纬度）
主要包含3类方法：
1. getS2RegionByXXX
   获取给定经纬度坐标对应的S2Region,该region可用于获取cellId,或用于判断包含关系
2. getCellIdList
   获取给定region的cellId,并通过childrenCellId方法控制其严格遵守minLevel
3. contains
   对于指定S2Region,判断经纬度或CellToken是否在其范围内

注意事项：

1. 该S2RegionCoverer不确定是否线程安全，待测试，不建议动态修改其配置参数
2. 原生的矩形Rect在某些参数下表现不正常，待确认，这里将其转为多边形对待。
#### 代码
```java
public enum S2Util {
    /**
     * 实例
     */
    INSTANCE;

    private static int minLevel = 11;
    private static int maxLevel = 16;
    private static int maxCells = 100;

    private static final S2RegionCoverer COVERER = new S2RegionCoverer();

    static {
        COVERER.setMinLevel(minLevel);
        COVERER.setMaxLevel(maxLevel);
        COVERER.setMaxCells(maxCells);
    }

    /**
     * 将单个cellId转换为多个指定level的cellId
     * @param s2CellId
     * @param desLevel
     * @return
     */
    public static List<S2CellId> childrenCellId(S2CellId s2CellId, Integer desLevel) {
        return childrenCellId(s2CellId, s2CellId.level(), desLevel);
    }

    private static List<S2CellId> childrenCellId(S2CellId s2CellId, Integer curLevel, Integer desLevel) {
        if (curLevel < desLevel) {
            long interval = (s2CellId.childEnd().id() - s2CellId.childBegin().id()) / 4;
            List<S2CellId> s2CellIds = Lists.newArrayList();
            for (int i = 0; i < 4; i++) {
                long id = s2CellId.childBegin().id() + interval * i;
                s2CellIds.addAll(childrenCellId(new S2CellId(id), curLevel + 1, desLevel));
            }
            return s2CellIds;
        } else {
            return Lists.newArrayList(s2CellId);
        }
    }

    /**
     * 将cellToken转换为经纬度
     * @param token
     * @return
     */
    public static Tuple2<Double, Double> toLatLon(String token) {
        S2LatLng latLng = new S2LatLng(S2CellId.fromToken(token).toPoint());
        return Tuple2.tuple(latLng.latDegrees(), latLng.lngDegrees());
    }

    /**
     * 将经纬度转换为cellId
     * @param lat
     * @param lon
     * @return
     */
    public static S2CellId toCellId(double lat, double lon) {
        return S2CellId.fromLatLng(S2LatLng.fromDegrees(lat, lon));
    }

    /**
     * 判断region是否包含指定cellToken
     * @param region
     * @param cellToken
     * @return
     */
    public static boolean contains(S2Region region, String cellToken) {
        return region.contains(new S2Cell(S2CellId.fromToken(cellToken)));
    }

    /**
     * 判断region是否包含指定经纬度坐标
     * @param region
     * @param lat
     * @param lon
     * @return
     */
    public static boolean contains(S2Region region, double lat, double lon) {
        S2LatLng s2LatLng = S2LatLng.fromDegrees(lat, lon);
        try {
            boolean contains = region.contains(new S2Cell(s2LatLng));
            return contains;
        } catch (NullPointerException e) {
            e.printStackTrace();
            return false;
        }
    }


    /**
     * 根据region获取cellId列表
     * @param region
     * @return
     */
    public static List<S2CellId> getCellIdList(S2Region region) {
        List<S2CellId> primeS2CellIdList = COVERER.getCovering(region).cellIds();
        return primeS2CellIdList.stream().flatMap(s2CellId -> S2Util.childrenCellId(s2CellId, S2Util.minLevel).stream()).collect(Collectors.toList());
    }

    /**
     * 根据region获取合并后的cellId列表
     * @param region
     * @return
     */
    public static List<S2CellId> getCompactCellIdList(S2Region region) {
        List<S2CellId> primeS2CellIdList = COVERER.getCovering(region).cellIds();
        return primeS2CellIdList;
    }

    /////////////     获取圆形region       ///////////////

    public static S2Region getS2RegionByCircle(double lat, double lon, double radius) {
        double capHeight = (2 * S2.M_PI) * (radius / 40075017);
        S2Cap cap = S2Cap.fromAxisHeight(S2LatLng.fromDegrees(lat, lon).toPoint(), capHeight * capHeight / 2);
        S2CellUnion s2CellUnion = COVERER.getCovering(cap);
        return cap;
    }

    public static S2Region getS2RegionByCircle(WGS84Point point, double radius) {
        return getS2RegionByCircle(point.getLatitude(), point.getLongitude(), radius);
    }

    /////////////     获取矩形region       ///////////////


    public static S2Region geS2RegionByRect(WGS84Point point1, WGS84Point point2) {
        return getS2RegionByRect(point1.getLatitude(), point1.getLongitude(), point2.getLatitude(), point2.getLongitude());
    }

    public static S2Region getS2RegionByRect(Tuple2<Double, Double> point1, Tuple2<Double, Double> point2) {
        return getS2RegionByRect(point1.getVal1(), point1.getVal2(), point2.getVal1(), point2.getVal2());
    }

    public static S2Region getS2RegionByRect(double lat1, double lon1, double lat2, double lon2) {
        List<Tuple2<Double, Double>> latLonTuple2List = Lists.newArrayList(Tuple2.tuple(lat1, lon1), Tuple2.tuple(lat1, lon2), Tuple2.tuple(lat2, lon2), Tuple2.tuple(lat2, lon1));
        return getS2RegionByPolygon(latLonTuple2List);
    }

    /////////////     获取多边形region       ///////////////

    public static S2Region getS2RegionByPolygon(WGS84Point[] pointArray) {
        List<Tuple2<Double, Double>> latLonTuple2List = Lists.newArrayListWithExpectedSize(pointArray.length);
        for (int i = 0; i < pointArray.length; ++i) {
            latLonTuple2List.add(Tuple2.tuple(pointArray[i].getLatitude(), pointArray[i].getLongitude()));
        }
        return getS2RegionByPolygon(latLonTuple2List);
    }

    public static S2Region getS2RegionByPolygon(Tuple2<Double, Double>[] tuple2Array) {
        return getS2RegionByPolygon(Lists.newArrayList(tuple2Array));
    }

    /**
     * 注意需要以逆时针方向添加坐标点
     */
    public static S2Region getS2RegionByPolygon(List<Tuple2<Double, Double>> latLonTuple2List) {
        List<S2Point> pointList = Lists.newArrayList();
        for (Tuple2<Double, Double> latlonTuple2 : latLonTuple2List) {
            pointList.add(S2LatLng.fromDegrees(latlonTuple2.getVal1(), latlonTuple2.getVal2()).toPoint());

        }
        S2Loop s2Loop = new S2Loop(pointList);
        S2PolygonBuilder builder = new S2PolygonBuilder(S2PolygonBuilder.Options.DIRECTED_XOR);
        builder.addLoop(s2Loop);
        return builder.assemblePolygon();
    }


    /////////////     配置coverer参数       ///////////////

    public static int getMinLevel() {
        return minLevel;
    }

    public static void setMinLevel(int minLevel) {
        S2Util.minLevel = minLevel;
        COVERER.setMinLevel(minLevel);
    }

    public static int getMaxLevel() {
        return maxLevel;
    }

    public static void setMaxLevel(int maxLevel) {
        S2Util.maxLevel = maxLevel;
        COVERER.setMaxLevel(maxLevel);
    }

    public static int getMaxCells() {
        return maxCells;
    }

    public static void setMaxCells(int maxCells) {
        S2Util.maxCells = maxCells;
        COVERER.setMaxCells(maxCells);
    }
}
	
```

#### 测试
##### 1. (不规则)多边形
1. 去http://apps.headwallphotonics.com/画个多边形,这里我画了个有棱有角的爱心标志,如下.
   ![爱心标志](https://img-blog.csdnimg.cn/20200502173431384.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
2. 将左下角的坐标信息作为参数,调用,测试代码如下
   ```java
       @Test
       public void getCellIdListByPolygon() {
           Map<Integer,Integer> sizeCountMap= Maps.newHashMap();
           StringBuilder sb3=new StringBuilder();
           S2Region s2Region = S2Util.getS2RegionByPolygon(Lists.newArrayList(Tuple2.tuple(23.851458634747043, 113.66432546548037),  Tuple2.tuple(21.60205563594303, 114.82887624673037),Tuple2.tuple(23.771049234941454, 116.18019460610537),Tuple2.tuple(23.16640234327511, 114.94423269204286)));
           List<S2CellId> cellIdListByPolygon = S2Util.getCellIdList(s2Region);
           cellIdListByPolygon.forEach(s2CellId -> {
               System.out.println("Level:" + s2CellId.level() + ",ID:" + s2CellId.toToken() + ",Min:" + s2CellId.rangeMin().toToken() + ",Max:" + s2CellId.rangeMax().toToken());
               sb3.append(",").append(s2CellId.toToken());
               sizeCountMap.put(s2CellId.level(),sizeCountMap.getOrDefault(s2CellId.level(),0)+1);
           });
           System.out.println(sb3.substring(1));
           System.out.println("totalSize:"+cellIdListByPolygon.size());
           sizeCountMap.entrySet().forEach(integerIntegerEntry -> {
               System.out.printf("level:%d,size:%d\n",integerIntegerEntry.getKey(),integerIntegerEntry.getValue());
           });
       }
   ```
3. 执行结果如下
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20200502173708151.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
   可以看到网格数远远超出了设定的100,不过网格大小严格控制在了11到16之间.
4. 将cellToken列表(逗号分隔)复制到 http://s2.sidewalklabs.com/regioncoverer/ ,点击那个网格(data)标志即可,如下
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20200502174203269.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
5. 如果调用的是getCompactCellIdList,则结果如下,其cell数从1000多压缩到200多.
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20200502174644676.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
##### 2 圆形
1. 这次我们再用 https://www.mapdevelopers.com/draw-circle-tool.php 到台湾省上面画个圈圈,如下
   ![圈圈](https://img-blog.csdnimg.cn/20200502175137239.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
2. 然后将其经纬度和坐标信息作为参数,调用,测试方法如下,使用的是getCompactCellIdList
   ```java
       public void getCellIdListByCircle() {
           Map<Integer,Integer> sizeCountMap= Maps.newHashMap();
           StringBuilder sb3=new StringBuilder();
           S2Region s2Region = S2Util.getS2RegionByCircle(23.753954,120.749615,193511.10);
           List<S2CellId> cellIdListByPolygon = S2Util.getCompactCellIdList(s2Region);
           cellIdListByPolygon.forEach(s2CellId -> {
               System.out.println("Level:" + s2CellId.level() + ",ID:" + s2CellId.toToken() + ",Min:" + s2CellId.rangeMin().toToken() + ",Max:" + s2CellId.rangeMax().toToken());
               sb3.append(",").append(s2CellId.toToken());
               sizeCountMap.put(s2CellId.level(),sizeCountMap.getOrDefault(s2CellId.level(),0)+1);
           });
           System.out.println(sb3.substring(1));
           System.out.println("totalSize:"+cellIdListByPolygon.size());
           sizeCountMap.entrySet().forEach(integerIntegerEntry -> {
               System.out.printf("level:%d,size:%d\n",integerIntegerEntry.getKey(),integerIntegerEntry.getValue());
           });
       }
   ```
3. 结果如下
   ![在这里插入图片描述](https://img-blog.csdnimg.cn/20200502175555629.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L2FsaW55dWE=,size_16,color_FFFFFF,t_70)
