import esri = __esri;

import EsriMap = require("esri/Map");
import MapView = require("esri/views/MapView");
import FeatureLayer = require("esri/layers/FeatureLayer");
import FeatureFilter = require("esri/views/layers/support/FeatureFilter");
import FeatureEffect = require("esri/views/layers/support/FeatureEffect");
import StatisticDefinition = require("esri/tasks/support/StatisticDefinition");
import { Extent } from "esri/geometry";
import { SimpleFillSymbol } from "esri/symbols";
import { SimpleRenderer } from "esri/renderers";
import { updateGrid } from "./heatmapChart";

import Expand = require("esri/widgets/Expand");
import { months } from "./constants";

( async () => {

  const layer = new FeatureLayer({
    portalItem: {
      id: "39eaa391a04e497c8ece630609a5b01f"
    },
    outFields: [ "MonthName" ]
  }); 

  const countiesLayer = new FeatureLayer({
    title: "counties",
    portalItem: {
      id: "39eaa391a04e497c8ece630609a5b01f"
    },
    popupTemplate: null,
    opacity: 0,
    renderer: new SimpleRenderer({
      symbol: new SimpleFillSymbol({
        color: [ 0,0,0,1 ],
        outline: null
      })
    })
  });

  const map = new EsriMap({
    basemap: "gray-vector",
    layers: [ layer, countiesLayer ]
  });

  const view = new MapView({
    map: map,
    container: "viewDiv",
    center: [ -85, 50 ],
    zoom: 4,
    highlightOptions: {
      color: "#262626",
      haloOpacity: 1,
      fillOpacity: 0
    }
  });

  await view.when();
  const monthsElement = document.getElementById("months-filter");
  monthsElement.style.visibility = "visible";
  const chartExpand = new Expand({
    view,
    content: document.getElementById("chartDiv"),
    expandIconClass: "esri-icon-chart",
    group: "top-left"
  });
  const monthsExpand = new Expand({
    view,
    content: monthsElement,
    expandIconClass: "esri-icon-filter",
    group: "top-left"
  });
  view.ui.add(monthsExpand, "top-left");
  view.ui.add(chartExpand, "top-left");
  view.ui.add("titleDiv", "top-right");

  const layerView = await view.whenLayerView(layer) as esri.FeatureLayerView;
  const countiesLayerView = await view.whenLayerView(countiesLayer) as esri.FeatureLayerView;

  const layerStats = await queryLayerStatistics(layer);
  updateGrid(layerStats, layerView);
  
  monthsElement.addEventListener("click", filterByMonth);
  const monthsNodes = document.querySelectorAll(`.month-item`);

  function filterByMonth (event: any) {
    const selectedMonth = event.target.getAttribute("data-month");
    monthsNodes.forEach( (node:HTMLDivElement) => {
      const month = node.innerText;
      if(month !== selectedMonth){
        if(node.classList.contains("visible-month")) {
          node.classList.remove("visible-month");
        }
      } else {
        if(!node.classList.contains("visible-month")) {
          node.classList.add("visible-month");
        }
      }
    });

    layerView.filter = new FeatureFilter({
      where: `Month = '${selectedMonth}'`
    });
  }

  function resetOnCollapse (expanded:boolean) {
    if (!expanded){
      resetVisuals();
    }
  }

  monthsExpand.watch("expanded", resetOnCollapse);
  chartExpand.watch("expanded", resetOnCollapse);

  let highlight:any = null;
  view.on("drag", ["Control"], eventListener);
  view.on("click", ["Control"], eventListener);
  let previousId: number;
  async function eventListener (event:any) {
    event.stopPropagation();

    const hitResponse = await view.hitTest(event);
    const hitResults = hitResponse.results.filter( hit => hit.graphic.layer === countiesLayer );
    if(hitResults.length > 0){
      const graphic = hitResults[0].graphic;
      if(previousId !== graphic.attributes.FID){
        previousId = graphic.attributes.FID;
        if (highlight) {
          highlight.remove();
          highlight = null;
        }
        
        highlight = countiesLayerView.highlight([previousId]);
        const geometry = graphic && graphic.geometry;
        let queryOptions = {
          geometry,
          spatialRelationship: "intersects"
        };

        const filterOptions = new FeatureFilter(queryOptions);

        layerView.effect = new FeatureEffect({
          filter: filterOptions,
          excludedEffect: "grayscale(90%) opacity(15%)"
        });

        const stats = await queryTimeStatistics(layerView, queryOptions);
        updateGrid(stats);
      }
    }
  }

  interface QueryTimeStatsParams {
    geometry?: esri.Geometry,
    distance?: number,
    units?: string
  }

  async function queryTimeStatistics ( layerView: esri.FeatureLayerView, params: QueryTimeStatsParams): Promise<ChartData[]>{
    const { geometry, distance, units } = params;

    const query = layerView.layer.createQuery();

    query.outStatistics = [
      new StatisticDefinition({
        onStatisticField: "1",
        outStatisticFieldName: "value",
        statisticType: "count"
      })
    ];
    query.groupByFieldsForStatistics = [ "MonthName" ];
    query.geometry = geometry;
    query.distance = distance;
    query.units = units;
    query.returnQueryGeometry = true;

    const queryResponse = await layerView.queryFeatures(query);

    const responseChartData = queryResponse.features.map( feature => {
      const timeSpan = feature.attributes["EXPR_1"].split("-");
      const month = timeSpan[0];
      return {
        month, 
        value: feature.attributes.value
      };
    });
    return createDataObjects(responseChartData);
  }

  async function queryLayerStatistics(layer: esri.FeatureLayer): Promise<ChartData[]> {
    const query = layer.createQuery();
    query.outStatistics = [
      new StatisticDefinition({
        onStatisticField: "1",
        outStatisticFieldName: "value",
        statisticType: "count"
      })
    ];
    query.groupByFieldsForStatistics = [ "MonthName" ];

    const queryResponse = await layer.queryFeatures(query);

    const responseChartData = queryResponse.features.map( feature => {
      const timeSpan = feature.attributes["EXPR_1"].split("-");
      const month = timeSpan[0];
      return {
        month, 
        value: feature.attributes.value
      };
    });
    return createDataObjects(responseChartData);
  }

  function createDataObjects(data: StatisticsResponse[]): ChartData[] {
    let formattedChartData: ChartData[] = [];

      months.forEach( (month, s) => {

        const matches = data.filter( datum => {
          return datum.month === month;
        });

        formattedChartData.push({
          col: t,
          row: s,
          value: matches.length > 0 ? matches[0].value : 0
        });

      });

    return formattedChartData;
  }

  const resetBtn = document.getElementById("resetBtn");
  resetBtn.addEventListener("click", resetVisuals);

  function resetVisuals () {
    layerView.filter = null;
    layerView.effect = null;
    if(highlight){
      highlight.remove();
      highlight = null;
    }
    monthsNodes.forEach( (node:HTMLDivElement) => {
      node.classList.add("visible-month");
    });
    updateGrid(layerStats, layerView, true);
  }

})();
