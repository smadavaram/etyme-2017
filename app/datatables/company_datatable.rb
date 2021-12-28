# frozen_string_literal: true

class CompanyDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :prefer_vendors_path

  def view_columns
    @view_columns ||= {
      id: { source: 'Company.id' },
      name: { source: 'Company.name' },
      users: { source: 'Company.name' },
      reminder_note: { source: 'Company.name' },
      status: { source: 'Company.name' },
      contact: { source: 'Company.name' },
      actions:  { source: 'Company.name' },
    }
  end

  def data
    records.where(subscribed: 1).map do |record|
      {
        id: record.id,
        name: company_profile(record),
        users: record.users.count,
        reminder_note: reminder_note(record),
        status: ban_unban_link(record),
        contact: contact_icon(record.owner),
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

  def company_profile(company)
    image_tag(company.logo, class: 'data-table-image mr-2', title: company.name.to_s).html_safe +
      link_to(do_ellipsis(company.name), profile_company_path(company))
  end

  def get_raw_records
    # TODO: Fetch only subscribed companies of a company
    Company.all.includes(%i[reminders statuses])
  end

  def reminder_note(record)
    #content_tag(:span, do_ellipsis(record.reminders.where(user_id: current_user)&.last&.title), class: 'bg-info badge mr-1').html_safe
    reminder  = record.reminders.where(user_id: current_user.id).last
    html      = ''
    html      += reminder.title unless reminder.blank?
    html.html_safe
  end

  def contact_icon(owner)
    contact_widget(owner&.email, owner&.phone, owner, chat_link: owner.present? ? chat_link(owner) : '#')
  end

  def actions(record)
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, company_company_add_reminder_path(record), remote: :true, title: 'Remind Me', class: 'data-table-icons') +
    if current_company.is_vendor?(record)
      link_to(content_tag(:i, nil, class: 'fa fa-fire hot').html_safe, '#', class: 'data-table-icons', title: 'Prefer Vendor')
    else
      link_to(content_tag(:i, nil, class: 'fa fa-fire').html_safe, prefer_vendors_path(id: record.id), method: :post, remote: :true, title: 'Add as Prefer Vendor', class: 'data-table-icons')
    end

    if current_user.subscribed?(current_company.id)
      link_to(content_tag(:i, nil, class: 'fas fa-rss-square').html_safe, users_unsubscribe_path(company_id: current_company&.id), method: :post, title: 'unsubscribed', class: 'data-table-icons')
    end

  end
end
