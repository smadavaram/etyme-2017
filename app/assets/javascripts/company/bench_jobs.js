// share hide and show on base of checked checkboxes
$("input[type=checkbox]").on("click", function () {});
// for share of checked rows
let global_arr = [];
$("#share_bench_button").on("click", function () {
  var table = $('#my_bench_datatable').dataTable();
  var checkBox = table.$('input:checked');
  global_arr = []
  for (i = 0; i < checkBox.length; ++i) {
    global_arr.push(checkBox[i].value)
  }
  if (global_arr.length > 0) {
    var candidate_url =
      window.location.origin + "/static/people?ids=" + global_arr;

    $("#candidate_share_url").text(candidate_url).attr("href", candidate_url);
    $("#candidates_ids").val(global_arr);
    $("#share-candidates").modal("toggle");

  } else {
    flash_error("Please select atleast one candidate to proceed.");
  }
});

$("#share_via_bench_button").on("click", function () {
  var table = $('#my_bench_datatable').dataTable();
  var checkBox = table.$('input:checked');
  global_arr = []
  for (i = 0; i < checkBox.length; ++i) {
    global_arr.push(checkBox[i].value)
  }
  if (global_arr.length > 0) {
    var candidate_url =
      window.location.origin + "/static/people?ids=" + global_arr;

    $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
    $('#generate_link_preview_btn').attr("disabled",false);
    $('#generate_link_preview_btn').html("Generate New Preview");
    $('#title').val("");
    $.ajax({
      url: '/candidates/get_link_preview?ids=' + global_arr,
      type: "GET",
      dataType: "json",
      success: function (response) {
        candidate_url = candidate_url + '&preview=' + response.key;
        console.log("URL: ", candidate_url);
        $('#preview_image').attr('src', response.preview);
        $('#preview_image').attr('hidden', false);
        $("#preview_candidate_share_url").text(candidate_url).attr("href", candidate_url);
        $("#candidates_ids").val(global_arr);
        $("#share-candidates-link-preview").modal("toggle");
        $(".sharethis-inline-share-buttons").attr("data-url", candidate_url);
      },
      error: function(response) {
        $("#preview_candidate_share_url").text(candidate_url).attr("href", candidate_url);
        $('#preview_image').attr('hidden', true);
        $("#candidates_ids").val(global_arr);
        $("#share-candidates-link-preview").modal("toggle");
      }
    });
  } else {
    flash_error("Please select atleast one candidate to proceed.");
  }
});

$("#generate_link_preview_btn").on("click", function () {
  var table = $('#my_bench_datatable').dataTable();
  var checkBox = table.$('input:checked');
  global_arr = []
  for (i = 0; i < checkBox.length; ++i) {
    global_arr.push(checkBox[i].value)
  }
  if (global_arr.length > 0) {
    var candidate_url =
      window.location.origin + "/static/people?ids=" + global_arr;

    $.ajax({
      url: '/candidates/generate_link_preview?ids=' + global_arr,
      type: "POST",
      dataType: "json",
      data: {
        title: $("#title").val()
      },
      success: function (response) {
        candidate_url = candidate_url + '&preview=' + response.key;
        $('#preview_image').attr('src', response.preview);
        $('#preview_image').attr('hidden', false);
        $("#preview_candidate_share_url").text(candidate_url).attr("href", candidate_url);
        $("#candidates_ids").val(global_arr);
        $(".sharethis-inline-share-buttons").attr("data-url", candidate_url);
        $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
        $('#generate_link_preview_btn').attr("disabled",false);
        $('#generate_link_preview_btn').html("Generate New Preview");
      },
      error: function(response) {
        flash_error("Sorry! Something Went Wrong.")
        $("#preview_candidate_share_url").text(candidate_url).attr("href", candidate_url);
        $('#preview_image').attr('hidden', true);
        $("#candidates_ids").val(global_arr);
        $('#generate_link_preview_btn').attr("data-disable-with","<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> Generating...");
        $('#generate_link_preview_btn').attr("disabled",false);
        $('#generate_link_preview_btn').html("Generate New Preview");
      }
    });
  } else {
    flash_error("Please select atleast one candidate to proceed.");
  }
});

$("#select_all_").on("click", function () {
  $("input[name='ids[]']").prop("checked", this.checked);
});

// for popover on link
$("a[rel=hover]").popover({
  html: true,
  trigger: "hover",
  placement: "top",
});
$("#share-candidates").on("shown.bs.modal", function () {
  $(".select2").select2({
    placeholder: "Groups/Contact/Email",
    tags: true,
  });
});
