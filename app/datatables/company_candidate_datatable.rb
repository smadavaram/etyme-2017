class CompanyCandidateDatatable < ApplicationDatatable
  def_delegator :@view, :is_hot?
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :candidate_make_hot_path
  def_delegator :@view, :bench_info_candidate_path
  def_delegator :@view, :candidate_make_normal_path
  def_delegator :@view, :candidate_add_reminder_path
  def_delegator :@view, :edit_company_candidate_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :candidate_remove_from_comapny_path
  def_delegator :@view, :public_profile_static_candidates_path

  def view_columns
    @view_columns ||= {
        id: {source: "Candidate.id"},
        name: {source: "Candidate.first_name"},
        company: {source: "Company.name"},
        first_name: {source: "Candidate.first_name"},
        title: {source: "Candidate.title"},
        contact: {source: "Candidate.phone"}
    }
  end

  def data
    records.map do |record|
      {
          id: record.id,
          company: company_profile(record),
          name: candidate_profile(record),
          recruiter: get_recruiter_email(record),
          contact: contact_icon(record),
          status: ban_unban_link(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def get_recruiter_email(record)
    do_ellipsis(record.associated_company.owner ? record.associated_company.owner.email : record.email, 15)
  end

  def company_profile(record)
    image_tag(record.associated_company.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(record.associated_company.name), profile_company_path(record.associated_company), class: 'data-table-font')
  end

  def candidate_profile user
    image_tag(user.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(user.full_name), public_profile_static_candidates_path(user), class: 'data-table-font')
  end

  def get_raw_records
    current_company.candidates.includes(:companies, :candidates_companies).joins(:associated_company)
  end

  def contact_icon record
    link_to(content_tag(:i, nil, class: 'fa fa-ellipsis-h').html_safe, bench_info_candidate_path(record), remote: true, method: :get, title: 'Show Bench Detail', class: 'data-table-icons') +
        contact_widget(record.email, record.phone,record,chat_link: chat_link(record))
  end

  def ban_unban_link(record)
    record.get_blacklist_status(current_company.id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, candidate_remove_from_comapny_path(record), remote: true, method: :post, title: "Delete #{record.full_name}", class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.id, 'Candidate'), method: :post, title: 'UnBlock Candidate', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, candidate_remove_from_comapny_path(record), remote: true, method: :post, title: "Delete #{record.full_name}", class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.id, 'Candidate'), method: :post, title: 'Block Candidate', class: 'data-table-icons')
  end

  def reminder_note record
    content_tag(:span, do_ellipsis(record&.reminders.where(user_id: current_user.id)&.last&.title), class: 'bg-info badge mr-1').html_safe
  end

  def actions record
    # link_to(content_tag(:i, nil, class: 'icon-feather-user-plus').html_safe, '#', title: 'Follow/Unfollow', class: 'data-table-icons') +
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, candidate_add_reminder_path(record), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        get_edit_link(record) +
        link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0122_download_file_computer_drive').html_safe, record.resume, download: true, title: "Download Resume", class: 'data-table-icons') +
        get_status_links(record)
  end

  def get_edit_link(record)
    unless record.confirmed_at.nil?
      link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, '#', title: "Cannot Edit #{record.full_name}", class: 'data-table-icons')
    else
      link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, edit_company_candidate_path(record), title: "Edit #{record.full_name}", class: 'data-table-icons')
    end
  end

  def get_status_links(record)
    if is_hot?(record)
      link_to(content_tag(:i, nil, class: 'fa fa-fire', style: 'color: #FF9933;').html_safe, candidate_make_normal_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Normal', data: {confirm: " Do you want to make #{record.full_name} Normal?", commit: 'Continue', cancel: 'Cancel'})
    else
      link_to(content_tag(:i, nil, class: 'fa fa-fire').html_safe, candidate_make_hot_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Hot', data: {confirm: " Do you want to make #{record.full_name} Hot?", commit: 'Continue', cancel: 'Cancel'})
    end
  end

end