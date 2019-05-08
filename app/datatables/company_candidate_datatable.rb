class CompanyCandidateDatatable < ApplicationDatatable
  def_delegator :@view, :is_hot?
  def_delegator :@view, :candidate_make_hot_path
  def_delegator :@view, :candidate_make_normal_path
  def_delegator :@view, :candidate_add_reminder_path
  def_delegator :@view, :edit_company_candidate_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :candidate_remove_from_comapny_path

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
    current_company.candidates.includes(:companies, :candidates_companies)
  end

  def contact_icon record
    contact_widget(record.email, record.phone)
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
    content_tag(:span, do_ellipsis(record&.reminders&.last&.title), class: 'bg-info badge mr-1').html_safe
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'icon-feather-user-plus').html_safe, '#', title: 'Follow/Unfollow', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-bell-o ').html_safe, candidate_add_reminder_path(record), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        get_edit_link(record) +
        link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0122_download_file_computer_drive').html_safe, record.resume, download: true, title: "Download Resume", class: 'data-table-icons') +
        get_status_links(record)
  end

  def get_edit_link(record)
    unless record.confirmed_at.nil?
      link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, '#' , title: "Cannot Edit #{record.full_name}", class: 'data-table-icons')
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