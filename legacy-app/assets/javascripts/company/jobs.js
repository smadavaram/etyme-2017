$("#select_all_" ).on( "click", function() {
    $("input[name='ids[]']").prop('checked', this.checked);
});
var checkedRows = new Array();
$("#share_jobs_button" ).on( "click", function() {
    checkedRows = []
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
$("#share_via_jobs_button" ).on( "click", function() {
    checkedRows = []
    $("input[name='ids[]']:checked").each(function(){
        checkedRows.push($(this).val());
    });
    if(checkedRows.length>0){
        $('#jobs_ids').val(checkedRows);
        $('#share-jobs-link-preview').modal('show');
        var jobs_url = window.location.origin + "/static/jobs?ids=" + checkedRows;
  
        $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
        $('#generate_link_preview_btn').attr("disabled",false);
        $('#generate_link_preview_btn').html("Generate New Preview");
        $('#title').val("");
        $.ajax({
            url: '/jobs/get_link_preview?ids=' + checkedRows,
            type: "GET",
            dataType: "json",
            success: function (response) {
            jobs_url = jobs_url + '&preview=' + response.key;
            console.log("URL: ", jobs_url);
            $('#preview_image').attr('src', response.preview);
            $('#preview_image').attr('hidden', false);
            $("#preview_job_share_url").text(jobs_url).attr("href", jobs_url);
            $("#candidates_ids").val(checkedRows);
            $("#share-jobs-link-preview").modal("show");
            $(".sharethis-inline-share-buttons").attr("data-url", jobs_url);
        },
        error: function(response) {
            $("#preview_job_share_url").text(jobs_url).attr("href", jobs_url);
            $('#preview_image').attr('hidden', true);
            $("#candidates_ids").val(checkedRows);
            $(".sharethis-inline-share-buttons").attr("data-url", jobs_url);
            $("#share-jobs-link-preview").modal("show");
            }
        });
    }
    else{
        flash_error("Please select atleast one job to proceed.");
    }
});
$("#generate_jobs_link_preview_btn").on("click", function () {
  checkedRows = []
  $("input[name='ids[]']:checked").each(function(){
      checkedRows.push($(this).val());
  });
  if (checkedRows.length > 0) {
    var jobs_url = window.location.origin + "/static/jobs?ids=" + checkedRows;

    $.ajax({
      url: '/jobs/generate_link_preview?ids=' + checkedRows,
      type: "POST",
      dataType: "json",
      data: {
        title: $("#title").val()
      },
      success: function (response) {
        jobs_url = jobs_url + '&preview=' + response.key;
        $('#preview_image').attr('src', response.preview);
        $('#preview_image').attr('hidden', false);
        $("#preview_job_share_url").text(jobs_url).attr("href", jobs_url);
        $("#candidates_ids").val(checkedRows);
        $(".sharethis-inline-share-buttons").attr("data-url", jobs_url);
        $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
        $('#generate_link_preview_btn').attr("disabled",false);
        $('#generate_link_preview_btn').html("Generate New Preview");
      },
      error: function(response) {
        flash_error("Sorry! Something Went Wrong.")
        $("#preview_job_share_url").text(jobs_url).attr("href", jobs_url);
        $('#preview_image').attr('hidden', true);
        $("#candidates_ids").val(checkedRows);
        $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
        $('#generate_link_preview_btn').attr("disabled",false);
        $('#generate_link_preview_btn').html("Generate New Preview");
      }
    });
  } else {
    flash_error("Please select atleast one job to proceed.");
  }
});  
$('#share-jobs').on('shown.bs.modal', function() {
    $(".select2").select2({
        placeholder: "Groups/Contact/Email",
        tags: true
    });
});