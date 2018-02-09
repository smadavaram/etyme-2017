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
            title: "HOME ( #{current_company.jobs.count + current_company.candidates.count+current_company.invited_companies.count}(candidates,contacts,jobs) )",
            content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + "</span>",
        },
        {
            href: '#',
            title: 'Activity',
            content: "<i class='fa fa-lg fa-fw fa-history'></i> <span class='menu-item-parent'>" + 'Activity' + "</span>",
            children: [
                {
                    href: '#',
                    title: 'Dashboard (My Company,My)',
                    content: "<span class='menu-item-parent'> Dashboard </span>"
                },

                {
                    href: activities_path(index:true),
                    title: 'Log',
                    content: "<span class='menu-item-parent'> Log </span>"
                },
                {
                    href: current_company.chats.exists? ? company_chat_path(current_company.chats.last) : ( current_company.prefer_vendors_chats.exists?  ? company_chat_path(current_company.prefer_vendors_chats.last) : '#'),
                    title: 'IM',
                    content: "<span class='menu-item-parent'> IM </span>"
                },
                {
                    href: company_conversations_path,
                    title: 'NEW IM',
                    content: "<span class='menu-item-parent'> New IM </span>"
                }
            ]
        },
        {
            href: '#',
            title: 'Network ',
            content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'Network' + "</span>",
            children: [
                {
                    href: companies_path(status: 'all'),
                    title: 'All Signed Up Companies on Etyme',
                    content: "<span class='menu-item-parent'> All Companies </span>"
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
                    title: 'My Directory',
                    content: "<span class='menu-item-parent'>" + 'My Directory' + "</span>",
                },
                {
                    href: candidates_path,
                    title: 'Candidates( My Candidates(W2), Hot Candidates, Vendor )',
                    content: "<span class='menu-item-parent'>" + 'Candidate(s)' + "</span>",
                },
                {
                    href: company_company_hot_index_path(current_company),
                    title: 'My Bench (Hot Candidates, Third Party)',
                    content: "<span class='menu-item-parent'>" + 'My Hotlist' + "</span>",
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
            title: 'BENCH',
            content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'BENCH' + "</span>",
            children: [
                {
                    href: company_bench_jobs_path,
                    title: 'My Bench (Hot Candidates, Third Party)',
                    content: "<span class='menu-item-parent'> My Bench </span>",
                },

                {
                    href: company_job_receives_path,
                    title: 'Received',
                    content: "<span class='menu-item-parent'> Received </span>"
                },
                {
                    href: company_public_jobs_path,
                    title: 'Public',
                    content: "<span class='menu-item-parent'> Public </span>"
                },
                {
                    href: company_owen_jobs_path,
                    title: 'My Job',
                    content: "<span class='menu-item-parent'> My Job </span>"
                }
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
                    title: 'Applicants',
                    content: "<span class='menu-item-parent'> Applicants </span>"
                }
            ]
        },

        {
            href: "#",
            title: 'HR',
            content: "<i class='fa fa-lg fa-fw fa-building-o'></i> <span class='menu-item-parent'>" + 'HR' + "</span>",
            children: [
                # {
                #     href: consultants_path,
                #     title: 'Consultants',
                #     content: "<span class='menu-item-parent'>" + 'Consultant(s)' + "</span>",
                # },

                {
                  href: contracts_path,
                  title: 'Contracts',
                  content: "<span class='menu-item-parent'> Contract(s) </span>",
                },

                {
                    href: company_sell_contracts_path,
                    title: 'Sell',
                    content: "<span class='menu-item-parent'> Sell </span>",
                },

                {
                    href: company_buy_contracts_path,
                    title: 'Buy',
                    content: "<span class='menu-item-parent'> Buy </span>",
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
            href: candidate_conversations_path,
            title: 'IM',
            content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'IM' + "</span>",
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

  def assign_fa_icon(group)
    if group =="Job"
      "fa-briefcase"
    elsif group=='Candidate'
      'fa-users'
    elsif group=='Company'
       'fa-building'
    end
  end

  def industry_list
    [
      "Banking, Investment Services & Insurance",
      "Education",
      "Energy & Utilities",
      "Government & Public Sector",
      "Pharmaceutical",
      "Healthcare/Medical",
      "Insurance",
      "High Tech & Telecom Providers",
      "Real Estate",
      "Construction & Labour",
      "Manufacturing"
    ]
  end

  def department_list
    [
      "IT - Services & Product Development",
      "Marketing Department",
      "Sales",
      "Human resourcesNon-IT - Research and Development",
      "Engineering",
      "Production",
      "Quality Assurance",
      "Logistics/Supply chain",
      "Doctors & Nurses"
    ]
  end

  def link_to_add_fields(name = nil, f = nil, association = nil, options = nil, html_options = nil, &block)
    # If a block is provided there is no name attribute and the arguments are
    # shifted with one position to the left. This re-assigns those values.
    f, association, options, html_options = name, f, association, options if block_given?

    options = {} if options.nil?
    html_options = {} if html_options.nil?

    if options.include? :locals
      locals = options[:locals]
    else
      locals = { }
    end

    if options.include? :partial
      partial = options[:partial]
    else
      partial = association.to_s.singularize + '_fields'
    end

    # Render the form fields from a file with the association name provided
    new_object = f.object.class.reflect_on_association(association).klass.new
    fields = f.fields_for(association, new_object, child_index: 'new_record') do |builder|
      render(partial, locals.merge!( f: builder))
    end

    # The rendered fields are sent with the link within the data-form-prepend attr
    html_options['data-form-prepend'] = raw CGI::escapeHTML( fields )
    html_options['href'] = '#'
    html_options['class'] = 'bttn btn-add btn'

    content_tag(:a,"+",html_options,&block)
  end

end
