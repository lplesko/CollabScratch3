interface StatisticsResponse {
   month: "January" | "February" | "March" | "April" | "May" | "June" | "July" | "August" | "September" | "October" | "November" | "December" | string,
   year: "2016" | "2017" | "2018" | "2019" | string,
   value: number
 } 
  
interface ChartData {
  row: number,
  col: number,
  value: number
}

interface CellHighlight {
  row: number,
  col: number
}
