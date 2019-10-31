$(document).ready(function(){
	
	$(".invoice_table_filter").click(function(){ 
	$('#tab').val($(this).data("tab"));     
	$("#sale_invoices_form").submit();
  });
});