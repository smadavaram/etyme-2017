class JobApplicationDatatable < ApplicationDatatable
  def_delegator :@view, :job_application_path
  def_delegator :@view, :make_company_candidate_path

  def view_columns
    @view_columns ||= {
        id: {source: "JobApplication.id"},
        application_number: {source: "JobApplication.id"},
        title: {source: 'Job.title'},
        status: {source: "JobApplication.status"},
        type: {source: "JobApplication.application_type"}
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
          type: record.application_type,
          actions: actions(record)
      }
    end
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-eye').html_safe, job_application_path(record), title: 'View Detail', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'chat', class: 'data-table-icons', data: {chattopic: "Job", cid: record.job.id, ctype: record.job.class.to_s, rid: record.applicationable_id, rtype: record.applicationable_type}) +
        link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0122_download_file_computer_drive').html_safe, record.applicant_resume, download: true, title: "Download Resume", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'icon-feather-user-plus').html_safe, make_company_candidate_path(record.applicationable), method: :put, title: 'Add to candidates', class: 'data-table-icons')
  end

  def candidate_profile record
    if user.photo.nil? || user.photo.empty?
      default_user_img(record.applicationable.first_name,record.applicationable.last_name)+
      link_to(do_ellipsis(record.applicationable.full_name), '#', class: 'data-table-font')
    else
      image_tag(record.applicationable.photo, class: 'data-table-image mr-1').html_safe +
      link_to(do_ellipsis(record.applicationable.full_name), '#', class: 'data-table-font')
    end

   
  end

  def get_raw_records
    current_company.sent_job_applications.joins(:job)
  end

end