# frozen_string_literal: true

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
  def_delegator :@view, :profile_company_candidate_path
  def_delegator :@view, :company_candidate_assign_groups_to_candidate_path

  def view_columns
    @view_columns ||= {
      id: { source: 'Candidate.id' },
      name: { source: 'Candidate.first_name' },
      company: { source: 'Company.name' },
      first_name: { source: 'Candidate.first_name' },
      title: { source: 'Candidate.title' },
      recruiter: { source: 'Candidate.recruiter' , searchable: false, orderable: false},
      visa:  { source: 'Candidate.visa', searchable: false, orderable: false },
      skills:  { source: 'Candidate.skills', searchable: false, orderable: false },
      reminder_note:  { source: 'Candidate.reminder_note', searchable: false, orderable: false },
      status:  { source: 'Candidate.recruiter', searchable: false, orderable: false },
      contact: { source: 'Candidate.phone' },
      actions:  { source: 'Candidate.actions' , searchable: false, orderable: false}
    }
  end

  def data
    records.map do |record|
      {
        id: record.id,
        # company: company_profile(record),
        name: candidate_profile(record),
        recruiter: get_recruiter_email(record),
        visa: record.candidate_visa,
        skills: prepare_skill_list(record),
        reminder_note: reminder_note(record),
        status: ban_unban_link(record),
        contact: contact_icon(record),
        actions: actions(record)
      }
    end
  end

  def get_recruiter_email(record)
    recruiter_email = record.recruiter.blank? ? '' : record.recruiter.email

    #if record.recruiter.blank?
      #company         = record.companies.find_by(id: current_company.id)
      #recruiter_email = '' #company.owner ? company.owner.email : record.email
    #end

    html  = ''
    html  += user_image(record.recruiter, style: 'width: 35px; height: 35px;', class: 'data-table-image mr-2') unless record.recruiter.blank?
    html  += "&nbsp;"
    html  += do_ellipsis(recruiter_email, 25)
    html.html_safe
  end

  def company_profile(record)
    company = record.companies.find_by(id: current_company.id)
    image_tag(company&.photo, title: company&.name.to_s, class: 'data-table-image mr-2').html_safe +
      link_to(do_ellipsis(company&.name), profile_company_path(company))
  end

  def candidate_profile(user)
    (link_to user_image(user, style: 'width: 35px; height: 35px;', class: 'data-table-image mr-2', title: user.full_name.to_s), profile_company_candidate_path(user)) +
      link_to(do_ellipsis(user.full_name), profile_company_candidate_path(user), class: 'pl-2')
  end

  def get_raw_records
    current_company.candidates.includes(:companies, :candidates_companies).joins(:candidates_companies).order(created_at: :desc)
  end

  def contact_icon(record)
    link_to(content_tag(:i, nil, class: 'fa fa-ellipsis-h').html_safe, bench_info_candidate_path(record), remote: true, method: :get, title: 'Show Bench Detail', class: 'data-table-icons') +
      contact_widget(record.email, record.phone, record, chat_link: chat_link(record))
  end

  def ban_unban_link(record)
    record.get_blacklist_status(current_company.id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, candidate_remove_from_comapny_path(record), remote: true, method: :post, title: "Delete #{record.full_name}", class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.id, 'Candidate'), method: :post, title: 'UnBlock Candidate', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, candidate_remove_from_comapny_path(record), remote: true, method: :post, title: "Delete #{record.full_name}", class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.id, 'Candidate'), method: :post, title: 'Block Candidate', class: 'data-table-icons')
  end

  def reminder_note(record)
    reminder  = record.reminders.where(user_id: current_user.id).last
    html      = ''
    html      += reminder.title unless reminder.blank?
    html.html_safe
  end

  def prepare_skill_list(record)
    content  =''

    record.skill_list.each do |skill|
      content += "<span class='bg-info badge mr-1'>#{skill}</span>"
    end

    content.html_safe
  end

  def actions(record)
    resume_download_link  = record.resume.present? ? record.resume : '#'
    resume_download_title = record.resume.present? ? 'Download Resume' : 'Resume Not Uploaded'

    # link_to(content_tag(:i, nil, class: 'icon-feather-user-plus').html_safe, '#', title: 'Follow/Unfollow', class: 'data-table-icons') +
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, candidate_add_reminder_path(record), remote: :true, title: 'Remind Me', class: 'data-table-icons') +
      get_edit_link(record) +
      link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0122_download_file_computer_drive').html_safe, resume_download_link, download: true, target: :blank, title: resume_download_title, class: 'data-table-icons') +
      get_status_links(record) +
      link_to(image_tag('groups.png', size: '16x16', class: '').html_safe, company_candidate_assign_groups_to_candidate_path(record), remote: true, title: 'Add to Group', class: 'data-table-icons')
  end

  def get_edit_link(record)
    if record.confirmed_at.nil?
      link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, edit_company_candidate_path(record), title: "Edit #{record.full_name}", class: 'data-table-icons')
    else
      link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, '#', title: "Cannot Edit #{record.full_name}", class: 'data-table-icons')
    end
  end

  def get_status_links(record)
    if is_hot?(record)
      link_to(content_tag(:i, nil, class: 'fa fa-fire', style: 'color: #FF9933;').html_safe, candidate_make_normal_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Normal', data: { confirm: " Do you want to make #{record.full_name} Normal?", commit: 'Continue', cancel: 'Cancel' })
    else
      link_to(content_tag(:i, nil, class: 'fa fa-fire').html_safe, candidate_make_hot_path(record), remote: true, method: :post, class: 'data-table-icons', title: 'Make Hot', data: { confirm: " Do you want to make #{record.full_name} Hot?", commit: 'Continue', cancel: 'Cancel' })
    end
  end
end
