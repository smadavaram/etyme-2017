$( ".file-pick" ).on('click',function() {
    $('.fp__overlay').css({'z-index':'99999'})});
var responsiveHelper_dt_basic = undefined;
var responsiveHelper_datatable_fixed_column = undefined;
var responsiveHelper_datatable_col_reorder = undefined;
var responsiveHelper_datatable_tabletools = undefined;
var otable = $('#datatable_fixed_column').DataTable({
    "sDom": "<'dt-toolbar'<'col-xs-12 col-sm-6 hidden-xs'f><'col-sm-6 col-xs-12 hidden-xs'<'toolbar'>>r>"+
        "t"+
        "<'dt-toolbar-footer'<'col-sm-6 col-xs-12 hidden-xs'i><'col-xs-12 col-sm-6'p>>",
    "autoWidth" : true,
    "oLanguage": {
        "sSearch": '<span class="input-group-addon"><i class="icon-feather-search"></i></span>'
    }

});

// Apply the filter
$("#datatable_fixed_column thead th input[type=text]").on( 'keyup change', function () {
    otable
        .column( $(this).parent().index()+':visible' )
        .search( this.value )
        .draw();

} );