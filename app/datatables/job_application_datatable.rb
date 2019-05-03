class JobApplicationDatatable < ApplicationDatatable
  def_delegator :@view, :job_application_path

  def view_columns
    @view_columns ||= {
        id: {source: "JobApplication.id"},
        application_number: {source: "JobApplication.id"},
        title: {source: 'Job.title'},
        status: {source: "JobApplication.status"}
    }
  end

  def data
    records.map do |record|
      {
          id: record.id,
          name: candidate_profile(record),
          application_number: record.id,
          title: do_ellipsis(record.job.title, 15),
          status: record.status,
          actions: actions(record)
      }
    end
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-eye').html_safe, job_application_path(record), title: 'View Detail', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'chat', class: 'data-table-icons', data: {chattopic: "Job", cid: record.job.id, ctype: record.job.class.to_s, rid: record.applicationable_id, rtype: record.applicationable_type}) +
        link_to(content_tag(:i, nil, class: 'fa fa-file-text-o').html_safe, record.applicant_resume, download: true, title: "Download Resume", class: 'data-table-icons')
  end

  def candidate_profile record
    image_tag(record.applicationable.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(record.applicationable.full_name), '#', class: 'data-table-font')
  end

  def get_raw_records
    current_company.sent_job_applications.includes(:job)
  end

end