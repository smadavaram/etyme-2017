$(document).ready(function(){
	
	$(".invoice_table_filter").click(function(){ 
		$('#tab').val($(this).data("tab")); //current  data tab value
	    // $("#sale_tag [data-tab="pending_invoice"]')     
	  $("#sale_invoices_form").submit();
  });
});