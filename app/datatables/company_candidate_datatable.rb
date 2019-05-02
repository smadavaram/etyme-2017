class CompanyCandidateDatatable < ApplicationDatatable
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :candidate_assign_status_path
  def_delegator :@view, :company_statuses_path
  def_delegator :@view, :candidate_add_reminder_path
  def_delegator :@view, :edit_company_candidate_path
  def_delegator :@view, :candidate_remove_from_comapny_path
  def_delegator :@view, :candidate_make_hot_path
  def_delegator :@view, :candidate_make_normal_path
  def_delegator :@view, :is_hot?

  def view_columns
    @view_columns ||= {
        id: {source: "Candidate.id"},
        name: {source: "Candidate.first_name"},
        first_name: {source: "Candidate.first_name"},
        title: {source: "Candidate.title"},
        contact: {source: "Candidate.phone"}
    }
  end

  def data
    records.map do |record|
      {
          id: record.id,
          name: candidate_profile(record),
          contact: contact_icon(record),
          status: ban_unban_link(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end


  def candidate_profile user
    image_tag(user.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(user.full_name), '#', class: 'data-table-font')
  end

  def get_raw_records
    Candidate.joins("INNER JOIN candidates_companies ON candidates_companies.applicantable_id = candidates.id AND candidates_companies.applicantable_type = 'Candidate'")
    User.joins("INNER JOIN candidates_companies ON candidates_companies.applicantable_id = users.id AND candidates_companies.applicantable_type = 'User'")

    current_company.candidates.includes(:companies, :candidates_companies)
  end

  def contact_icon record
    mail_to(record.email, content_tag(:i, nil, class: 'os-icon os-icon-email-2-at2').html_safe, title: record.email, class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-phone ').html_safe, '#', title: record.phone, class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'chat', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-calendar').html_safe, '#', title: 'Add meeting', class: 'data-table-icons')
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
    content_tag(:span, do_ellipsis(record&.reminders&.last&.title), class: 'bg-info badge mr-1').html_safe +
        content_tag(:span, record&.statuses&.last&.status_type, class: 'bg-info badge').html_safe
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-sticky-note ').html_safe, company_statuses_path(id: record, type: 'Candidate'), title: 'Status Log', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-sticky-note-o ').html_safe, candidate_assign_status_path(record), remote: :true, title: "Assign Status", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'icon-feather-user-plus').html_safe, '#', title: 'Follow/Unfollow', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-bell-o ').html_safe, candidate_add_reminder_path(record), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, edit_company_candidate_path(record), title: "Edit #{record.full_name}", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-file-text-o').html_safe, record.resume, download: true, title: "Download Resume", class: 'data-table-icons') +
        get_status_links(record)
  end

  def get_status_links(record)
    if is_hot?(record)
      link_to(content_tag(:i, nil, class: 'fa fa-fire', style: 'color: #FF9933;').html_safe, candidate_make_normal_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Normal', data: {confirm: " Do you want to make #{record.full_name} Normal?", commit: 'Continue', cancel: 'Cancel'})
    else
      link_to(content_tag(:i, nil, class: 'fa fa-fire').html_safe, candidate_make_hot_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Hot', data: {confirm: " Do you want to make #{record.full_name} Hot?", commit: 'Continue', cancel: 'Cancel'})
    end
  end

end