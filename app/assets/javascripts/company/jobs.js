$("#select_all_" ).on( "click", function() {
    $("input[name='ids[]']").prop('checked', this.checked);
});
var checkedRows = new Array();
$("#share_jobs_button" ).on( "click", function() {
    $("input[name='ids[]']:checked").each(function(){
        checkedRows.push($(this).val());
    });
    if(checkedRows.length>0){
        $('#jobs_ids').val(checkedRows);
        $('#share-jobs').modal('show');
    }
    else{
        flash_error("Please select atleast one job to proceed.");
    }
});
$('#share-jobs').on('shown.bs.modal', function() {
    $(".select2").select2({
        placeholder: "Groups/Contact/Email",
        tags: true
    });
});