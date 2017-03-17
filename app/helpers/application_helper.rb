# :nodoc:
module ApplicationHelper
  def disable_spinning text
    return  "<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> #{text}"
  end
  def left_menu
    left_menu_entries(left_menu_content)
  end
  def candidate_left_menu
    left_menu_entries(candidate_left_menu_content)
  end

  private

  def selected_locale
    locale = FastGettext.locale
    locale_list.detect {|entry| entry[:locale] == locale}
  end

  def locale_list
    [
        {
            flag: 'us',
            locale: 'en',
            name: 'English (US)',
            alt_name: 'United States'
        },
        {
            flag: 'fr',
            locale: 'fr',
            name: 'Français',
            alt_name: 'France'
        },
        {
            flag: 'es',
            locale: 'es',
            name: 'Español',
            alt_name: 'Spanish'
        },
        {
            flag: 'de',
            locale: 'de',
            name: 'Deutsch',
            alt_name: 'German'
        },
        {
            flag: 'jp',
            locale: 'ja',
            name: '日本語',
            alt_name: 'Japan'
        },
        {
            flag: 'cn',
            locale: 'zh',
            name: '中文',
            alt_name: 'China'
        },
        {
            flag: 'it',
            locale: 'it',
            name: 'Italiano',
            alt_name: 'Italy'
        },
        {
            flag: 'pt',
            locale: 'pt',
            name: 'Portugal',
            alt_name: 'Portugal'
        },
        {
            flag: 'ru',
            locale: 'ru',
            name: 'Русский язык',
            alt_name: 'Russia'
        },
        {
            flag: 'kr',
            locale: 'kr',
            name: '한국어',
            alt_name: 'Korea'
        },
    ]
  end

  def left_menu_entries(entries = [])
    output = ''
    entries.each do |entry|
      next if entry.nil?
      children_selected = entry[:children] &&
          (entry[:children] - [nil]).any? {|child| current_page?(child[:href]) }
      entry_selected =  current_page?(entry[:href])
      li_class =
          case
            when children_selected
              'open'
            when entry_selected
              'active'
          end
      output +=
          content_tag(:li, class: li_class) do
            subentry = ''
            subentry +=
                link_to entry[:href], title: entry[:title], class: entry[:class], target: entry[:target] do
                  link_text = ''
                  link_text += entry[:content].html_safe
                  if entry[:children]
                    if children_selected
                      link_text += '<b class="collapse-sign"><em class="fa fa-minus-square-o"></em></b>'
                    else
                      link_text += '<b class="collapse-sign"><em class="fa fa-plus-square-o"></em></b>'
                    end
                  end

                  link_text.html_safe
                end
            if entry[:children]
              if children_selected
                ul_style = 'display: block'
              else
                ul_style = ''
              end
              subentry +=
                  "<ul style='#{ul_style}'>" +
                      left_menu_entries(entry[:children]) +
                      "</ul>"
            end

            subentry.html_safe
          end
    end
    output.html_safe
  end

  def left_menu_content
    [
        {
            href: '/dashboard',
            title: 'HOME',
            content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + "</span>",
        },
        {
            href: '#',
            title: 'My Network ',
            content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'My Network' + "</span>",
            children: [
                {
                    href: activities_path(index:true),
                    title: 'Activity Log',
                    content: "<span class='menu-item-parent'> Activity Log </span>"
                },
                {
                    href: prefer_vendors_path,
                    title: 'Network Request',
                    content: "<span class='menu-item-parent'> Network Request(s) </span>"
                },

                {
                    href: network_path,
                    title: 'Clients / Vendors',
                    content: "<span class='menu-item-parent'> Clients / Vendors </span>"
                },
                {
                    href:  directories_path,
                    title: 'Directory',
                    content: "<span class='menu-item-parent'>" + 'Directory' + "</span>",
                },
                {
                    href: candidates_path,
                    title: 'Candidates',
                    content: "<span class='menu-item-parent'>" + 'Candidate(s)' + "</span>",
                },
                {
                    href: company_company_hot_index_path(current_company),
                    title: 'Hot Candidates',
                    content: "<span class='menu-item-parent'>" + 'Hot Candidate(s)' + "</span>",
                },
                {
                    href: companies_path,
                    title: 'Contacts',
                    content: "</i><span class='menu-item-parent'> Contact(s) </span>"
                },


             ]
        },
        {
            href: '#',
            title: 'JOBS',
            content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + "</span>",
            children: [
                {
                    href: jobs_path,
                    title: 'All Jobs',
                    content: "<span class='menu-item-parent'> All Posted Job(s) </span>"
                },

                {
                    href: job_invitations_path,
                    title: 'Job Invitations',
                    content: "<span class='menu-item-parent'> Invitation(s) </span>"
                },
                {
                    href: job_applications_path,
                    title: 'Job Applications',
                    content: "<span class='menu-item-parent'> Application(s)/Candidate(s) </span>"
                },
            ]
        },

        {
            href: "#",
            title: 'HR',
            content: "<i class='fa fa-lg fa-fw fa-building-o'></i> <span class='menu-item-parent'>" + 'HR' + "</span>",
            children: [
                {
                    href: consultants_path,
                    title: 'Consultants',
                    content: "<span class='menu-item-parent'>" + 'Consultant(s)' + "</span>",
                },

                {
                  href: contracts_path,
                  title: 'Contracts',
                  content: "<span class='menu-item-parent'> Contract(s) </span>",
                  }


            ]
        },
        {
            href: timesheets_path,
            title: 'Timesheets',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'TIMESHEETS' + "</span>",
        },

        {
            href: '#',
            title: 'Accounting ',
            content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Accounting' + "</span>",
            children: [
                if has_permission?('show_invoices') || has_permission?('manage_contracts')
                {
                    href: invoices_path(sent_invoice:true),
                    title: 'Sent Invoices',
                    content: "<span class='menu-item-parent'>Sent Invoices </span>"
                }end,
                if has_permission?('show_invoices') || has_permission?('manage_contracts')
                {
                    href: invoices_path(received_invoice: true),
                    title: 'Received Invoices',
                    content: "<span class='menu-item-parent'> Received Invoices </span>"
                }end,
                {
                    href: consultants_path,
                    title: 'Salaries',
                    content: "<span class='menu-item-parent'> Salaries </span>"
                },
                {
                    href: "#",
                    title: ' Payments',
                    content: "<span class='menu-item-parent'>  Payments </span>"
                },
            ]
        },

          {
              href:  current_user.is_owner? ? employees_leaves_path : (current_user.is_consultant? ? consultant_leaves_path(current_user) : '#'),
              title: 'Leaves',
              content: "<i class='fa fa-lg fa-fw fa-calendar-times-o'></i> <span class='menu-item-parent'>" + 'Leaves' + "</span>",
          },

    ]
  end


  def candidate_left_menu_content
    [
        {
            href: '/candidate',
            title: 'HOME',
            content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + "</span>",
        },
        {
            href: '#',
            title: 'JOBS',
            content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + "</span>",
            children: [
                {
                    href: candidate_jobs_path,
                    title: 'Jobs',
                    content: "<span class='menu-item-parent'> Jobs </span>"
                },
                {
                    href: candidate_job_applications_path,
                    title: 'Job Applications',
                    content: "<span class='menu-item-parent'> Job Applications </span>"
                },
                {
                    href: candidate_job_invitations_path,
                    title: 'Job Invitations',
                    content: "<span class='menu-item-parent'> Job Invitations </span>"
                }
            ]
        }
    ]
  end

  def time_format s
    return "--" if s.nil?
    seconds = s % 60
    minutes = (s / 60) % 60
    hours = s / (60 * 60)
    format("%02d:%02d:%02d", hours, minutes, seconds)
  end

  def digg_pagination data
    # will_paginate @collection, {link_options: {'data-remote': true}, params: {action: 'other_action'}}
    digg = ""
    digg = "<div class='text-center'><div class='digg_pagination'>"
    digg += will_paginate(data , {params: params }).to_s
    digg += "</div></div>"
    raw(digg)
  end

  def has_permission?(permission)
    current_user.has_permission(permission) || current_user.is_owner?
  end
end
