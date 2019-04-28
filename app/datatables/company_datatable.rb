class CompanyDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path

  def view_columns
    @view_columns ||= {
        id: {source: "Company.id"},
        name: {source: "Company.name"},
    }
  end


  def data
    records.map do |record|
      {
          id: record.id,
          name: company_profile(record),
          users: record.users.count,
          contact: contact_icon(record),
          status: content_tag(:span, record.statuses.where(user_id: current_user)&.last&.status_type, class: 'label-info badge').html_safe,
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def company_profile company
    link_to(do_ellipsis(company.name), profile_company_path(company), class: 'data-table-font').html_safe
  end

  def get_raw_records
    Company.all.includes([:reminders, :statuses])
  end

  def reminder_note record
    content_tag(:span, do_ellipsis(record.reminders.where(user_id: current_user)&.last&.title), class: 'label-info badge mr-1').html_safe
  end

  def contact_icon record
    mail_to(record.owner&.email, content_tag(:i, nil, class: 'os-icon os-icon-email-2-at2').html_safe, title: "#{record.email}", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-phone  ').html_safe, '#', title: "#{record.phone}", class: 'data-table-icons')+
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-calendar').html_safe, '#', title: 'Add meeting', class: 'data-table-icons')+
        link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'Add Comment', class: 'data-table-icons')

  end


  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-sticky-note ').html_safe, company_assign_status_path(record.id), remote: :true, title: "Assign Status", class: 'data-table-icons')+
        link_to(content_tag(:i, nil, class: 'fa fa-bell ').html_safe, company_company_add_reminder_path(record), remote: :true, title: "Remind Me", class: 'data-table-icons')
  end


end
