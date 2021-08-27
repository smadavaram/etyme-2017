# frozen_string_literal: true

class CompanyContactDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :company_statuses_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :company_user_profile_path
  def_delegator :@view, :company_assign_status_path
  def_delegator :@view, :company_company_add_reminder_path
  def_delegator :@view, :company_contacts_company_companies_path
  def_delegator :@view, :company_company_assign_groups_to_contact_path
  def_delegator :@view, :edit_company_path
  def_delegator :@view, :company_company_contact_path

  def view_columns
    @view_columns ||= {
      id: { source: 'CompanyContact.id' },
      name: { source: 'Company.name' },
      first_name: { source: 'User.first_name' },
      title: { source: 'CompanyContact.title' },
      groups:  { source: 'CompanyContact.groups' , searchable: false, orderable: false},
      reminder_note:  { source: 'CompanyContact.reminder_note' , searchable: false, orderable: false},
      status:  { source: 'CompanyContact.status' , searchable: false, orderable: false},
      contact: { source: 'CompanyContact.contact' , searchable: false, orderable: false},
      actions:  { source: 'CompanyContact.actions' , searchable: false, orderable: false},
    }
  end

  def data
    records.map do |record|
      {
        id: record.id,
        first_name: company_user_profile(record.user),
        name: company_profile(record.try(:user_company)),
        title: do_ellipsis(record.title),
        groups: groups(record),
        reminder_note: reminder_note(record),
        status: ban_unban_link(record),
        contact: contact_icon(record.user),
        actions: actions(record)
      }
    end
  end

  def company_user_profile(user)
    (link_to user_image(user, style: 'width: 35px; height: 35px;', class: 'data-table-image mr-2', title: user.full_name.to_s), company_user_profile_path(user)) +
      link_to(do_ellipsis(user.full_name), company_user_profile_path(user), class: 'pl-2')
  end

  def company_profile(company)
    image_tag(company.logo, class: 'data-table-image mr-2', title: company.name.to_s).html_safe +
      link_to(do_ellipsis(company.name), profile_company_path(company))
  end

  def get_raw_records
    current_company.company_contacts.includes(:user_company, company: %i[reminders statuses]).joins(:user, :user_company)
  end

  def reminder_note(record)
    content_tag(:span, do_ellipsis(record.user_company&.reminders.where(user_id: current_user.id)&.last&.title), class: 'bg-info badge mr-1').html_safe
    reminder  = record.user_company.reminders.where(user_id: current_user.id).last
    html      = ''
    html      += reminder.title unless reminder.blank?
    html.html_safe
  end

  def contact_icon(user)
    contact_widget(user.email, user.phone, user, chat_link: chat_link(user))
  end

  def groups(record)
    if record.groups.count > 0
      link_to(record.groups.count, company_company_assign_groups_to_contact_path(record), remote: true, class: 'data-table-icons')
    else
      record.groups.count
    end
  end

  def actions(record)
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, company_company_add_reminder_path(record.user_company), remote: :true, title: 'Remind Me', class: 'data-table-icons') +
      link_to(image_tag('groups.png', size: '16x16', class: '').html_safe, company_company_assign_groups_to_contact_path(record), remote: true, title: 'Add to Group', class: 'data-table-icons')
  end

  def ban_unban_link(record)
    record.user_company.get_blacklist_status(record.company_id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, company_company_contact_path(record.id), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.user_company_id, 'Company'), method: :post, title: 'WhiteList Company', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, company_company_contact_path(record.id), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.user_company_id, 'Company'), method: :post, title: 'BlackList Company ', class: 'data-table-icons')
  end
end
