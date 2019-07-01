class CompanyDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :ban_company_black_listers_path

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
          status: ban_unban_link(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end


  def ban_unban_link(record)
    record.get_blacklist_status(current_company.id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.id, 'Company'), method: :post, title: 'UnBlock Company', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.id, 'Company'), method: :post, title: 'Block Company', class: 'data-table-icons')
  end


  def company_profile company
    link_to(do_ellipsis(company.name), profile_company_path(company), class: 'data-table-font').html_safe
  end

  def get_raw_records
    Company.all.includes([:reminders, :statuses])
  end

  def reminder_note record
    content_tag(:span, do_ellipsis(record.reminders.where(user_id: current_user)&.last&.title), class: 'bg-info badge mr-1').html_safe
  end

  def contact_icon record
    contact_widget(record.email, record.phone)
  end


  def actions record
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, company_company_add_reminder_path(record), remote: :true, title: "Remind Me", class: 'data-table-icons')
  end


end
