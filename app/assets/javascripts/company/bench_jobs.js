// share hide and show on base of checked checkboxes
$("input[type=checkbox]").on("click", function () {});
// for share of checked rows
let global_arr = [];
$("#my_bench_datatable")
  .find(".check")
  .change((e) => {
    id = e.target.value;
    if (global_arr.includes(id)) {
      global_arr = global_arr.filter((x) => x !== id);
    } else {
      global_arr.push(id);
    }
  });
$(".share").on("click", function () {
  //   $("input[name='ids[]']:checked").each(function () {
  //     checkedRows.push($(this).val());
  //   });
  if (global_arr.length > 0) {
    var candidate_url =
      window.location.origin + "/static/people?ids=" + global_arr;
    $("#candidate_share_url").text(candidate_url).attr("href", candidate_url);
    $("#candidates_ids").val(global_arr);
    $("#share-candidates").modal("toggle");
  } else {
    alert("Please select atleast one candidate to proceed before.");
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
