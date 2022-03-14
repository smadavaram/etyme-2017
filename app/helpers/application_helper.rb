# frozen_string_literal: true
require "image_processing/mini_magick"



# :nodoc:
module ApplicationHelper

  def disable_spinning(text)
    "<i class='fa fa-spinner fa-pulse fa-spin pull-left'></i> #{text}"
  end

  def convert_image(width, height, image)
    ImageProcessing::MiniMagick
                  .source(image || image_path("og.jpg"))
                  .resize_to_limit(width, height)
                  .call
  end

  def user_domain?
    current_user.domain == request.subdomain
  end

  def left_menu
    left_menu_entries(left_menu_content)
  end

  def is_inbox_path
    controller_name == 'conversations' && action_name == 'index'
  end

  def candidate_left_menu
    left_menu_entries(candidate_left_menu_content)
  end

  def is_verify(status)
    status ? 'verified' : 'unverified'
  end

  def snake_to_words(tag)
    tag.tableize.singularize.split('_').join(' ').capitalize if tag.present?
  end

  def chat_link(user, conversation_id = nil)
    mini_chat_company_conversations_path(conversation_id: conversation_id, utype: user&.class&.to_s, uid: user&.id)
  end

  def chat_remote_link(options)
    if options[:remote_false]
      link_to(content_tag(:i, nil, class: 'fa fa-comment-o ChatBtn').html_safe, options[:chat_link] || '#', title: 'chat', class: "data-table-icons #{options[:remote_false]}")
    else
      link_to(content_tag(:i, nil, class: 'fa fa-comment-o ChatBtn').html_safe, options[:chat_link] || '#', remote: true, title: 'Chat', class: 'data-table-icons')

    end
  end
  def chat_remote_link_recruiter(options)
    if options[:remote_false]
      link_to(image_tag("reply.svg", :class => "img-fluid mr-2").html_safe, options[:chat_link] || '#', title: 'chat', class: "data-table-icons #{options[:remote_false]}")
    else
      link_to(image_tag("reply.svg", :class => "img-fluid mr-2").html_safe, options[:chat_link] || '#', remote: true, title: 'Chat', class: 'data-table-icons')
    end
  end










   def chat_remote_link_recruiter_profile(options)
    if options[:remote_false]
      link_to("<div class='profile-button-chat'> <i class='fa fa-commenting mr-2' aria-hidden='true'></i> Chat </div>".html_safe, options[:chat_link] || '#', title: 'chat', class: "data-table-icons #{options[:remote_false]}")
    else
      link_to("<div class='profile-button-chat'> <i class='fa fa-commenting mr-2' aria-hidden='true'></i> Chat </div>".html_safe, options[:chat_link] || '#', remote: true, title: 'Chat', class: 'data-table-icons')
    end
  end














  def chat_recruiter_link_image(user)
    profile_class = ""
    if (user.present?) && (user.photo.present?)
      (user && user.photo) ? profile_photo = user.photo : profile_photo = "avatars/male.png"
      
      if( profile_photo != "avatars/male.png" )
        profile_class = "imag_css_for_pic"
      end
      image_tag(profile_photo, :class => "imag_css #{profile_class} rounded-circle", :title=> "#{user.first_name + ' ' +user.last_name + "/" + user.try(:company).try(:name)}", width: "35", height: "35")
    else
      (user && user.photo) ? profile_photo = user.photo : profile_photo = "avatars/male.png"
      if (profile_photo != "avatars/male.png")
        profile_class = "imag_css_for_pic"
      end
      image_tag(profile_photo, :class => "imag_css #{profile_class} rounded-circle",:title=> "#{user.first_name + ' ' +user.last_name + "/" + user.try(:company).try(:name)}", width: "35", height: "35")
      # link_to(image_tag(profile_photo, :class => "imag_css"))
    end

# if user.photo&.present?
#       image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe
#     else
#       image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe
#     end
  end

  def contact_widget(email, phone, _user_id = nil, options = {})
    chat_remote_link(options) +
        mail_to(email, content_tag(:i, nil, class: 'os-icon os-icon-email-2-at2').html_safe, title: email, class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-phone ', style:' font-size: 15px !important; margin-right: 4px; color: grey').html_safe, "skype:#{phone.present? ? phone : ''}?call", title: phone, class: 'data-table-icons') +
        "<div title = 'Add to Calendar' class = 'addeventatc' style= 'margin-top: 6px; z-index: 0; padding: 5px; !important;'>
          <span class = 'start' >06/10/2019 08:00 AM</span>
          <span class='end'>06/10/2019 10:00 AM</span>
          <span class='timezone'>America/Los_Angeles </span>
          <span class='title'></span>
          <span class = 'description' ></span>
          <span class='os-icon os-icon-calendar' style='color: red'></span>
          <span class='attendees'></span>
        </div >".html_safe
  end

  def rate_author(rate)
    rate.author_type.constantize.find(rate.author_id)
  end

  def rating_starts(value, additional_classes='')
    range_field_tag "rating", value, max: 5, step: 0.5, class: "rating #{additional_classes}", style: "--value:#{value}; cursor: auto;", disabled: true
  end

  def contact_widget_recuirter(email, phone, _user_id = nil, options = {})
    chat_remote_link_recruiter(options)
  end
  def contact_widget_recuirter_profile(email, phone, _user_id = nil, options = {})
    chat_remote_link_recruiter_profile(options)
  end

  def mini_chat_contact_widget(email, phone, _user_id = nil, _options = {})
    mail_to(email, content_tag(:i, nil, class: 'os-icon os-icon-email-2-at2 mini_chat_widget pt-3',style:' font-size: 20px;  padding: 4px; color: grey !important').html_safe, title: email, class: 'data-table-icons') +
      link_to(content_tag(:i, nil, class: 'os-icon os-icon-phone mini_chat_widget', style:' font-size: 20px; padding: 5px; color: grey !important').html_safe, "skype:#{phone.present? ? phone : ''}?call", title: phone, class: 'data-table-icons') +
      "<div title = 'Add to Calendar' class = 'addeventatc z-100'>
        <span class = 'start' >06/10/2019 08:00 AM</span>
        <span class='end'>06/10/2019 10:00 AM</span>
        <span class='timezone'>America/Los_Angeles </span>
        <span class='title'></span>
        <span class = 'description' ></span>
        <span class='os-icon os-icon-calendar mini_chat_widget' style:'font-size: 25px; padding: 5px; color: grey !important;'></span>
        <span class='attendees'></span>
      </div >".html_safe
  end

  def do_ellipsis(value, length = 20)
    if value
      post_fix = value.length > length ? '...' : ''
      content_tag(:span, "#{value[0..length].strip}#{post_fix}", class: 'ellipsis', title: value).html_safe
    end
  end

  def mask(string, all_but = 4, char = '#')
    string.gsub(/.(?=.{#{all_but}})/, char) if string.present?
  end

  def user_age(dob)
    now = Time.now.utc.to_date
    now.year - dob.year - ((now.month > dob.month || (now.month == dob.month && now.day >= dob.day)) ? 0 : 1)
  end

  private

  def selected_locale
    locale = FastGettext.locale
    locale_list.detect { |entry| entry[:locale] == locale }
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
      }
    ]
  end

  def left_menu_entries(entries = [])
    output = ''
    entries.each do |entry|
      next if entry.nil?

      children_selected = entry[:children] &&
                          (entry[:children] - [nil]).any? { |child| current_page?(child[:href]) }
      entry_selected = current_page?(entry[:href])
      li_class =
        if children_selected
          'open'
        elsif entry_selected
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
                link_text += if children_selected
                               '<b class="collapse-sign"><em class="fa fa-minus-square-o"></em></b>'
                             else
                               '<b class="collapse-sign"><em class="fa fa-plus-square-o"></em></b>'
                             end
              end

              link_text.html_safe
            end
          if entry[:children]
            ul_style = if children_selected
                         'display: block'
                       else
                         ''
                       end
            subentry +=
              "<ul style='#{ul_style}'>" +
              left_menu_entries(entry[:children]) +
              '</ul>'
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
        title: "HOME ( #{current_company.jobs.count + current_company.candidates.count + current_company.invited_companies.count}(candidates,contacts,jobs) )",
        content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + '</span>'
      },
      {
        href: '#',
        title: 'Activity',
        content: "<i class='fa fa-lg fa-fw fa-history'></i> <span class='menu-item-parent'>" + 'Activity' + '</span>',
        children: [
          {
            href: '#',
            title: 'Dashboard (My Company,My)',
            content: "<span class='menu-item-parent'> Dashboard </span>"
          },

          {
            href: activities_path(index: true),
            title: 'Log',
            content: "<span class='menu-item-parent'> Log </span>"
          },
          # {
          #     href: current_company.chats.exists? ? company_chat_path(current_company.chats.last) : ( current_company.prefer_vendors_chats.exists?  ? company_chat_path(current_company.prefer_vendors_chats.last) : '#'),
          #     title: 'IM',
          #     content: "<span class='menu-item-parent'> IM </span>"
          # },
          {
            href: company_conversations_path,
            title: 'Inbox',
            content: "<span class='menu-item-parent'> Inbox </span>"
          }
        ]
      },
      {
        href: '#',
        title: 'Network ',
        content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'Network' + '</span>',
        children: [
          {
            href: groups_path,
            title: 'Group',
            content: "<span class='menu-item-parent'>" + 'Group(s)' + '</span>'
          },
          {
            href: directories_path,
            title: 'My Directory',
            content: "<span class='menu-item-parent'>" + 'My Directory' + '</span>'
          },
          {
            href: candidates_path,
            title: 'Candidates( My Candidates(W2), Hot Candidates, Vendor )',
            content: "<span class='menu-item-parent'>" + 'Candidate(s)' + '</span>'
          },
          # {
          #     href: company_company_hot_index_path(current_company),
          #     title: 'My Bench (Hot Candidates, Third Party)',
          #     content: "<span class='menu-item-parent'>" + 'My Hotlist' + "</span>",
          # },
          {
            href: companies_path,
            title: 'Company',
            content: "</i><span class='menu-item-parent'> Company(s) </span>"
          },
          {
            href: company_contacts_company_companies_path,
            title: 'Contacts',
            content: "</i><span class='menu-item-parent'> Contact(s) </span>"
          }
          # ,
          # {
          #     href: company_company_contacts_path,
          #     title: 'Contacts',
          #     content: "</i><span class='menu-item-parent'> Contact(s) </span>"
          # }
        ]
      },
      {
        href: '#',
        title: 'Supplier Management',
        content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'Supplier Management' + '</span>',
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
          }
        ]
      },

      {
        href: '#',
        title: 'BENCH',
        content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'BENCH' + '</span>',
        children: [
          {
            href: company_bench_jobs_path,
            title: 'My Bench (Hot Candidates, Third Party)',
            content: "<span class='menu-item-parent'> My Bench </span>"
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
            title: 'Bench Job',
            content: "<span class='menu-item-parent'> Bench Job </span>"
          }
        ]
      },

      {
        href: '#',
        title: 'JOBS',
        content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + '</span>',
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
        href: '#',
        title: 'HR',
        content: "<i class='fa fa-lg fa-fw fa-building-o'></i> <span class='menu-item-parent'>" + 'HR' + '</span>',
        children: [
          # {
          #     href: consultants_path,
          #     title: 'Consultants',
          #     content: "<span class='menu-item-parent'>" + 'Consultant(s)' + "</span>",
          # },

          {
            href: contracts_path,
            title: 'Contracts',
            content: "<span class='menu-item-parent'> Contract(s) </span>"
          },

          {
            href: company_sell_contracts_path,
            title: 'Sell',
            content: "<span class='menu-item-parent'> Sell </span>"
          },

          {
            href: company_buy_contracts_path,
            title: 'Buy',
            content: "<span class='menu-item-parent'> Buy </span>"
          },
          {
            href: timeline_contracts_path,
            title: 'Timeline',
            content: "<span class='menu-item-parent'> Timeline </span>"
          }
        ]
      },
      {
        href: '#',
        title: 'Timesheet ',
        content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Timesheet' + '</span>',
        children: [
          {
            href: timesheets_path,
            title: 'Submitted',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Submitted' + '</span>'
          },
          {
            href: approved_timesheets_path,
            title: 'Approved',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Approved' + '</span>'
          },
          {
            href: current_user.is_owner? ? employees_leaves_path : (current_user.is_consultant? ? consultant_leaves_path(current_user) : '#'),
            title: 'Leaves',
            content: "<i class='fa fa-lg fa-fw fa-calendar-times-o'></i> <span class='menu-item-parent'>" + 'Leaves' + '</span>'
          }
        ]
      },
      {
        href: '#',
        title: 'Accounting ',
        content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Accounting' + '</span>',
        children: [
          {
            href: '#',
            title: 'Sales',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Sales' + '</span>',
            children: [
              if has_permission?('show_invoices') || has_permission?('manage_contracts')
                {
                  href: invoices_path,
                  title: 'Open Invoices',
                  content: "<span class='menu-item-parent'>Open Invoices </span>"
                }
              end,
              if has_permission?('show_invoices') || has_permission?('manage_contracts')
                {
                  href: cleared_invoice_invoices_path,
                  title: 'Cleared Invoices',
                  content: "<span class='menu-item-parent'> Cleared Invoices </span>"
                }
              end,
              {
                href: recieved_payment_company_accountings_path,
                title: 'Payment',
                content: "<span class='menu-item-parent'> payment </span>"
              }
            ]
          },
          {
            href: '#',
            title: 'Purchasing',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Purchasing' + '</span>',
            children: [
              {
                href: bill_to_pay_company_accountings_path,
                title: 'Open Bills(s)',
                content: "<span class='menu-item-parent'> Open Bills </span>"
              },
              {
                href: bill_received_company_accountings_path,
                title: 'Vendor Bill(s)',
                content: "<span class='menu-item-parent'> Vendor Bill </span>"
              },
              {
                href: bill_pay_company_accountings_path,
                title: 'Bill Payment(s)',
                content: "<span class='menu-item-parent'> Bill Pay </span>"
              }
            ]
          },
          {
            href: '#',
            title: 'salary',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'salary' + '</span>',
            children: [
              {
                href: salary_to_pay_company_accountings_path,
                title: 'Salary Payment(s)',
                content: "<span class='menu-item-parent'> Salary To Pay</span>"
              },
              {
                href: salary_list_salaries_path,
                title: 'Salary Payment(s)',
                content: "<span class='menu-item-parent'> Salary Adavance</span>"
              },
              {
                href: report_salaries_path,
                title: 'Salary Payment(s)',
                content: "<span class='menu-item-parent'> Salary Calculation </span>"
              },
              {
                href: '#',
                title: 'Salary Calculation(s)',
                content: "<span class='menu-item-parent'> Salary Calculation(s) </span>"
              },
              {
                href: '#',
                title: 'Salary Payment(s)',
                content: "<span class='menu-item-parent'> Salary Payment(s)</span>"
              }
            ]
          },
          {
            href: '#',
            title: 'expenses',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'expenses' + '</span>',
            children: [
              {
                href: '#',
                title: 'Open Bills',
                content: "<span class='menu-item-parent'> Open Bills </span>"
              },
              {
                href: '#',
                title: 'Bill Payment(s)',
                content: "<span class='menu-item-parent'> Bill Payment(s) </span>"
              },
              {
                href: '#',
                title: 'Expense Payment(s)',
                content: "<span class='menu-item-parent'> Expense Payment(s)</span>"
              }
            ]
          },
          {
            href: '#',
            title: 'Reporting',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Reporting' + '</span>'
          }
        ]
      }
    ]
  end

  def candidate_left_menu_content
    [
      {
        href: '/candidate',
        title: 'HOME',
        content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + '</span>'
      },
      {
        href: '#',
        title: 'Activity',
        content: "<i class='fa fa-lg fa-fw fa-history'></i> <span class='menu-item-parent'>" + 'Activity' + '</span>',
        children: [
          {
            href: '#',
            title: 'Dashboard (My Company,My)',
            content: "<span class='menu-item-parent'> Dashboard </span>"
          },

          {
            href: '#',
            title: 'Log',
            content: "<span class='menu-item-parent'> Log </span>"
          },
          # {
          #     href: current_company.chats.exists? ? company_chat_path(current_company.chats.last) : ( current_company.prefer_vendors_chats.exists?  ? company_chat_path(current_company.prefer_vendors_chats.last) : '#'),
          #     title: 'IM',
          #     content: "<span class='menu-item-parent'> IM </span>"
          # },
          {
            href: candidate_conversations_path,
            title: 'Inbox',
            content: "<span class='menu-item-parent'> Inbox </span>"
          }
        ]
      },
      {
        href: '#',
        title: 'Network ',
        content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'Network' + '</span>',
        children: [
          {
            href: '#',
            title: 'Group',
            content: "<span class='menu-item-parent'>" + 'Group(s)' + '</span>'
          },
          {
            href: '#',
            title: 'My Directory',
            content: "<span class='menu-item-parent'>" + 'My Directory' + '</span>'
          },
          {
            href: '#',
            title: 'Candidates( My Candidates(W2), Hot Candidates, Vendor )',
            content: "<span class='menu-item-parent'>" + 'Candidate(s)' + '</span>'
          },
          # {
          #     href: company_company_hot_index_path(current_company),
          #     title: 'My Bench (Hot Candidates, Third Party)',
          #     content: "<span class='menu-item-parent'>" + 'My Hotlist' + "</span>",
          # },
          {
            href: '#',
            title: 'Companys',
            content: "</i><span class='menu-item-parent'> Company(s) </span>"
          },
          {
            href: '#',
            title: 'Contacts',
            content: "</i><span class='menu-item-parent'> Contact(s) </span>"
          }
        ]
      },
      {
        href: '#',
        title: 'BENCH',
        content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'BENCH' + '</span>',
        children: [
          {
            href: benchs_path,
            title: 'My Bench (Hot Candidates, Third Party)',
            content: "<span class='menu-item-parent'> My Bench </span>"
          }
          #   ,
          #
          # {
          #     href: "#",
          #     title: 'Received',
          #     content: "<span class='menu-item-parent'> Received </span>"
          # },
          # {
          #     href: "#",
          #     title: 'Public',
          #     content: "<span class='menu-item-parent'> Public </span>"
          # },
          # {
          #     href: "#",
          #     title: 'Bench Job',
          #     content: "<span class='menu-item-parent'> Bench Job </span>"
          # }
        ]
      },

      {
        href: '#',
        title: 'JOBS',
        content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + '</span>',
        children: [
          {
            href: candidate_jobs_path,
            title: 'All Jobs',
            content: "<span class='menu-item-parent'> All Posted Job(s) </span>"
          },

          {
            href: candidate_job_invitations_path,
            title: 'Job Invitations',
            content: "<span class='menu-item-parent'> Invitation(s) </span>"
          },
          {
            href: candidate_job_applications_path,
            title: 'Applicants',
            content: "<span class='menu-item-parent'> Applicants </span>"
          }
        ]
      },

      {
        href: '#',
        title: 'HR',
        content: "<i class='fa fa-lg fa-fw fa-building-o'></i> <span class='menu-item-parent'>" + 'HR' + '</span>',
        children: [
          # {
          #     href: consultants_path,
          #     title: 'Consultants',
          #     content: "<span class='menu-item-parent'>" + 'Consultant(s)' + "</span>",
          # },

          {
            href: '#',
            title: 'Contracts',
            content: "<span class='menu-item-parent'> Contract(s) </span>"
          },

          {
            href: '#',
            title: 'Sell',
            content: "<span class='menu-item-parent'> Sell </span>"
          },

          {
            href: '#',
            title: 'Buy',
            content: "<span class='menu-item-parent'> Buy </span>"
          }
        ]
      },
      {
        href: '#',
        title: 'Timesheet ',
        content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Timesheet' + '</span>',
        children: [

          {
            href: candidate_timesheets_path,
            title: 'Timesheets',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Timesheets' + '</span>'
          },
          {
            href: submitted_timesheets_candidate_timesheets_path,
            title: 'Submitted',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Submitted' + '</span>'
          },
          {
            href: approve_timesheets_candidate_timesheets_path,
            title: 'Approved',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Approved' + '</span>'
          },
          {
            href: '#',
            title: 'Leaves',
            content: "<i class='fa fa-lg fa-fw fa-calendar-times-o'></i> <span class='menu-item-parent'>" + 'Leaves' + '</span>'
          }
        ]
      },
      {
        href: '#',
        title: 'Client Expense ',
        content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Client Expense' + '</span>',
        children: [

          {
            href: candidate_client_expenses_path,
            title: 'Client Expenses',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Expenses' + '</span>'
          },
          {
            href: submitted_client_expenses_candidate_client_expenses_path,
            title: 'Submitted Client Expense',
            content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Submitted' + '</span>'
          }
        ]
      },
      {
        href: '#',
        title: 'Accounting ',
        content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Accounting' + '</span>',
        children: [
          # if has_permission?('show_invoices') || has_permission?('manage_contracts')
          {
            href: '#',
            title: 'Open Invoices',
            content: "<span class='menu-item-parent'>Open Invoices </span>"
          },
          # if has_permission?('show_invoices') || has_permission?('manage_contracts')
          {
            href: '#',
            title: 'Cleared Invoices',
            content: "<span class='menu-item-parent'> Cleared Invoices </span>"
          },
          {
            href: '#',
            title: 'Open Bills',
            content: "<span class='menu-item-parent'> recieved_payment </span>"
          },
          {
            href: '#',
            title: 'Bill Payment(s)',
            content: "<span class='menu-item-parent'> Bill To Pay </span>"
          },
          {
            href: '#',
            title: 'Bill Payment(s)',
            content: "<span class='menu-item-parent'> Bill Received </span>"
          },
          {
            href: '#',
            title: 'Bill Payment(s)',
            content: "<span class='menu-item-parent'> Bill Pay </span>"
          },

          {
            href: '#',
            title: 'Salary Payment(s)',
            content: "<span class='menu-item-parent'> Salary To Pay</span>"
          },
          {
            href: '#',
            title: 'Salary Payment(s)',
            content: "<span class='menu-item-parent'> Salary Adavance</span>"
          },
          {
            href: '#',
            title: 'Salary Payment(s)',
            content: "<span class='menu-item-parent'> Salary Calculation </span>"
          },
          {
            href: '#',
            title: 'Open Bills',
            content: "<span class='menu-item-parent'> Open Bills </span>"
          },
          {
            href: '#',
            title: 'Bill Payment(s)',
            content: "<span class='menu-item-parent'> Bill Payment(s) </span>"
          },
          {
            href: '#',
            title: 'Expense Payment(s)',
            content: "<span class='menu-item-parent'> Expense Payment(s)</span>"
          },
          {
            href: '#',
            title: 'Salary Calculation(s)',
            content: "<span class='menu-item-parent'> Salary Calculation(s) </span>"
          },
          {
            href: '#',
            title: 'Salary Payment(s)',
            content: "<span class='menu-item-parent'> Salary Payment(s)</span>"
          }
        ]
      },
      {
        href: '#',
        title: 'Reporting',
        content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Sale' + '</span>'
      },
      {
        href: '#',
        title: 'Reporting',
        content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Reporting' + '</span>'
      }
    ]
  end

  # def candidate_left_menu_content
  #   [
  #       {
  #           href: '/candidate',
  #           title: 'HOME',
  #           content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + "</span>",
  #       },
  #       {
  #           href: candidate_conversations_path,
  #           title: 'IM',
  #           content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'IM' + "</span>",
  #       },
  #       {
  #           href: '#',
  #           title: 'Network',
  #           content: "<i class='fa fa-lg fa-fw fa-globe'></i> <span class='menu-item-parent'>" + 'Network' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'Company',
  #                   content: "<span class='menu-item-parent'> Company </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Contacts',
  #                   content: "<span class='menu-item-parent'> Contacts </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Groups',
  #                   content: "<span class='menu-item-parent'> Groups </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Lists',
  #                   content: "<span class='menu-item-parent'> Lists </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Directory',
  #                   content: "<span class='menu-item-parent'> Directory </span>"
  #               }
  #           ]
  #       },
  #   {
  #       href: '#',
  #       title: 'Bench',
  #       content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'Bench' + "</span>",
  #       children: [
  #           {
  #               href: '#',
  #               title: 'Invited bench',
  #               content: "<span class='menu-item-parent'> Invited bench </span>"
  #           },
  #           {
  #               href: candidate_company_info_benchs_path,
  #               title: 'My company',
  #               content: "<span class='menu-item-parent'> My company </span>"
  #           },
  #           {
  #               href: benchs_path,
  #               title: 'Public Jobs',
  #               content: "<span class='menu-item-parent'> Public Jobs </span>"
  #           },
  #           {
  #               href: candidate_bench_job_benchs_path,
  #               title: 'Bench Jobs',
  #               content: "<span class='menu-item-parent'> Bench Jobs </span>"
  #           }
  #       ]
  #   },
  #   {
  #       href: '#',
  #       title: 'Trainings',
  #       content: "<i class='fa fa-lg fa-fw fa-book'></i> <span class='menu-item-parent'>" + 'Trainings' + "</span>",
  #       children: [
  #           {
  #               href: '#',
  #               title: 'My Trainings',
  #               content: "<span class='menu-item-parent'> My Trainings </span>"
  #           },
  #           {
  #               href: '#',
  #               title: 'Invited',
  #               content: "<span class='menu-item-parent'> Invited </span>"
  #           },
  #           {
  #               href: '#',
  #               title: 'Public trainings',
  #               content: "<span class='menu-item-parent'> Public Jobs </span>"
  #           }
  #       ]
  #   },
  #   {
  #       href: '#',
  #       title: 'JOBS',
  #       content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + "</span>",
  #       children: [
  #           {
  #               href: candidate_jobs_path,
  #               title: 'My Jobs',
  #               content: "<span class='menu-item-parent'> My Jobs </span>"
  #           },
  #           {
  #               href: candidate_job_applications_path,
  #               title: 'Job Applications',
  #               content: "<span class='menu-item-parent'> Job Applications </span>"
  #           },
  #           {
  #               href: candidate_job_invitations_path,
  #               title: 'Job Invitations',
  #               content: "<span class='menu-item-parent'> Job Invitations </span>"
  #           }
  #       ]
  #   },
  #   {
  #       href: '#',
  #       title: 'Contract',
  #       content: "<i class='fa fa-lg fa-fw  fa-list-alt'></i> <span class='menu-item-parent'>" + 'Contract' + "</span>",
  #       children: [
  #           {
  #               href: candidate_contracts_path,
  #               title: 'Recieved',
  #               content: "<span class='menu-item-parent'> Recieved </span>"
  #           },
  #           {
  #               href: candidate_job_applications_path,
  #               title: 'My Contracts',
  #               content: "<span class='menu-item-parent'> My Contracts </span>"
  #           }
  #       ]
  #   },
  #       {
  #           href: candidate_timesheets_path,
  #           title: 'Timesheets',
  #           content: "<i class='fa fa-lg fa-fw fa-calendar'></i> <span class='menu-item-parent'>" + 'Timesheets' + "</span>",
  #       },
  #       {
  #           href: '#',
  #           title: 'Expenses',
  #           content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Expenses' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'Submitted',
  #                   content: "<span class='menu-item-parent'> Submitted </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Approved',
  #                   content: "<span class='menu-item-parent'> Approved </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Rejected',
  #                   content: "<span class='menu-item-parent'> Rejected </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Cleared',
  #                   content: "<span class='menu-item-parent'> Cleared </span>"
  #               }
  #           ]
  #       },
  #       {
  #           href: '#',
  #           title: 'Payments',
  #           content: "<i class='fa fa-lg fa-fw fa-money'></i> <span class='menu-item-parent'>" + 'Payments' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'To be paid',
  #                   content: "<span class='menu-item-parent'> To be paid </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'Recieved',
  #                   content: "<span class='menu-item-parent'> Recieved </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'All',
  #                   content: "<span class='menu-item-parent'> All </span>"
  #               }
  #           ]
  #       },
  #       {
  #           href: '#',
  #           title: 'Profitabiity',
  #           content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'Profitabiity' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'Contact',
  #                   content: "<span class='menu-item-parent'> Contact </span>"
  #               }
  #           ]
  #       },
  #       {
  #           href: '#',
  #           title: 'Future',
  #           content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'Future' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'Invitations',
  #                   content: "<span class='menu-item-parent'> Invitations </span>"
  #               }
  #           ]
  #       },
  #       {
  #           href: '#',
  #           title: 'Add-ons',
  #           content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'Add-ons' + "</span>",
  #           children: [
  #               {
  #                   href: '#',
  #                   title: 'Insurance',
  #                   content: "<span class='menu-item-parent'> Insurance </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: '401K',
  #                   content: "<span class='menu-item-parent'> 401K </span>"
  #               },
  #               {
  #                   href: '#',
  #                   title: 'ADP',
  #                   content: "<span class='menu-item-parent'> ADP </span>"
  #               }
  #           ]
  #       }
  #   ]
  # end

  def time_format(sec)
    return '--' if sec.nil?

    seconds = sec % 60
    minutes = (sec / 60) % 60
    hours = sec / (60 * 60)
    format('%02d:%02d:%02d', hours, minutes, seconds)
  end

  def digg_pagination(data, tab = nil, options = {})
    # will_paginate @collection, {link_options: {'data-remote': true}, params: {action: 'other_action'}}
    digg = ''
    digg = "<div class='text-center'><div class='digg_pagination'>"
    digg += will_paginate(data, { params: params.merge(tab: tab) }.merge(options)).to_s
    digg += '</div></div>'
    raw(digg)
  end

  def has_permission?(permission)
    true
    # session[:permissions]&.include?(permission) || current_user.has_permission("manage_all") || current_user.is_owner?
  end

  def assign_fa_icon(group)
    if group == 'Job'
      'fa-briefcase'
    elsif group == 'Candidate'
      'fa-users'
    elsif group == 'Company'
      'fa-building'
    end
  end

  def industry_list
    [
      'Banking, Investment Services & Insurance',
      'Education',
      'Energy & Utilities',
      'Government & Public Sector',
      'Pharmaceutical',
      'Healthcare/Medical',
      'Insurance',
      'High Tech & Telecom Providers',
      'Real Estate',
      'Construction & Labour',
      'Manufacturing',
      'Hospitality'
    ]
  end

  def department_list
    [
      'IT - Services & Product Development',
      'Marketing Department',
      'Sales',
      'Human resourcesNon-IT',
      'Research and Development',
      'Engineering',
      'Production',
      'Quality Assurance',
      'Logistics/Supply chain',
      'Doctors & Nurses',
      'Human resourcesNon-IT',
      'Research and Development'
    ]
  end

  def job_status
    %w[Draft Bench Published Cancelled Suspended Archived]
  end

  def link_to_add_fields(name = nil, field = nil, association = nil, options = nil, html_options = nil, &block)
    # If a block is provided there is no name attribute and the arguments are
    # shifted with one position to the left. This re-assigns those values.
    if block_given?
      html_options = options
      options = association
      association = field
      field = name
    end

    options = {} if options.nil?
    html_options = {} if html_options.nil?

    locals = if options.include? :locals
               options[:locals]
             else
               {}
             end

    partial = if options.include? :partial
                options[:partial]
              else
                association.to_s.singularize + '_fields'
              end

    # Render the form fields from a file with the association name provided
    new_object = field.object.class.reflect_on_association(association).klass.new
    fields = field.fields_for(association, new_object, child_index: 'new_record') do |builder|
      render(partial, locals.merge!(f: builder))
    end

    # The rendered fields are sent with the link within the data-form-prepend attr
    html_options['data-form-prepend'] = raw CGI.escapeHTML(fields)
    html_options['href'] = '#'
    html_options['class'] = 'bttn btn-add btn'

    content_tag(:a, '+', html_options, &block)
  end

  def buy_contract_time_sheet(pay_type, pay_schedule)
    # for time sheet
    if pay_type == 'time_sheet' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'time_sheet' && pay_schedule == 'daily'
      @contract.buy_contract&.ts_day_time&.try(:strftime, '%H:%M')
    elsif pay_type == 'time_sheet' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.buy_contract&.ts_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'time_sheet' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.buy_contract&.ts_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'time_sheet' && pay_schedule == 'twice a month'
      'On ' + @contract.buy_contract&.ts_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.buy_contract&.ts_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ts_date_2.present?).to_s + (' End of month' if @contract.buy_contract&.ts_end_of_month).to_s
    elsif pay_type == 'time_sheet' && pay_schedule == 'monthly'
      'On ' + (@contract.buy_contract&.ts_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ts_date_1.present?).to_s + (' End of month' if @contract.buy_contract&.ts_end_of_month).to_s

      # for time sheet approve
    elsif pay_type == 'ts_approve' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'ts_approve' && pay_schedule == 'daily'
      @contract.buy_contract&.ta_day_time&.try(:strftime, '%H:%M')
    elsif pay_type == 'ts_approve' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.buy_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'ts_approve' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.buy_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'ts_approve' && pay_schedule == 'twice a month'
      'On ' + @contract.buy_contract&.ta_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.buy_contract&.ta_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ta_date_2.present?).to_s + (' End of month' if @contract.buy_contract&.ta_end_of_month).to_s
    elsif pay_type == 'ts_approve' && pay_schedule == 'monthly'
      'On ' + (@contract.buy_contract&.ta_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ta_date_1.present?).to_s + (' End of month' if @contract.buy_contract&.ta_end_of_month).to_s

      # for salary calculation
    elsif pay_type == 'salary_calculation' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'salary_calculation' && pay_schedule == 'daily'
      'At ' + @contract.buy_contract&.sc_day_time&.try(:strftime, '%H:%M').to_s
    elsif pay_type == 'salary_calculation' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.buy_contract&.sc_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'salary_calculation' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.buy_contract&.sc_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'salary_calculation' && pay_schedule == 'twice a month'
      'On ' + @contract.buy_contract&.sc_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.buy_contract&.sc_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.sc_date_2).to_s + (' End of month' if @contract.buy_contract&.sc_end_of_month).to_s
    elsif pay_type == 'salary_calculation' && pay_schedule == 'monthly'
      'On ' + (@contract.buy_contract&.sc_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.sc_date_1).to_s + (' End of month' if @contract.buy_contract&.sc_end_of_month).to_s

      # for salary process
    elsif pay_type == 'salary_process' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'salary_process' && pay_schedule == 'daily'
      'At ' + @contract.buy_contract&.sp_day_time&.try(:strftime, '%H:%M').to_s
    elsif pay_type == 'salary_process' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.buy_contract&.sp_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'salary_process' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.buy_contract&.sp_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'salary_process' && pay_schedule == 'twice a month'
      'On ' + @contract.buy_contract&.sp_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.buy_contract&.sp_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.sp_date_2).to_s + (' End of month' if @contract.buy_contract&.sp_end_of_month).to_s
    elsif pay_type == 'salary_process' && pay_schedule == 'monthly'
      'On ' + (@contract.buy_contract&.sp_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.sp_date_1).to_s + (' End of month' if @contract.buy_contract&.sp_end_of_month).to_s

      # for vendor payment (invoice receipt)
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'daily'
      'At ' + @contract.buy_contract&.ir_day_time&.try(:strftime, '%H:%M').to_s
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.buy_contract&.ir_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.buy_contract&.ir_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'twice a month'
      'On ' + @contract.buy_contract&.ir_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.buy_contract&.ir_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ir_date_2).to_s + (' End of month' if @contract.buy_contract&.ir_end_of_month)
    elsif pay_type == 'invoice_recepit' && pay_schedule == 'monthly'
      'On ' + (@contract.buy_contract&.ir_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.buy_contract&.ir_date_1).to_s + (' End of month' if @contract.buy_contract&.ir_end_of_month).to_s

    else
      ''
    end
  end

  def sell_contract_time_sheet(pay_type, pay_schedule)
    # for time sheet
    if pay_type == 'time_sheet' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'time_sheet' && pay_schedule == 'daily'
      @contract.sell_contract&.ts_day_time&.try(:strftime, '%H:%M')
    elsif pay_type == 'time_sheet' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.sell_contract&.ts_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'time_sheet' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.sell_contract&.ts_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'time_sheet' && pay_schedule == 'twice a month'
      'On ' + @contract.sell_contract&.ts_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.sell_contract&.ts_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.ts_date_2.present?).to_s + (' End of month' if @contract.sell_contract&.ts_end_of_month).to_s
    elsif pay_type == 'time_sheet' && pay_schedule == 'monthly'
      'On ' + (@contract.sell_contract&.ts_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.ts_date_1).to_s + (' End of month' if @contract.sell_contract&.ts_end_of_month).to_s

      # for time sheet approve
    elsif pay_type == 'ts_approve' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'ts_approve' && pay_schedule == 'daily'
      @contract.sell_contract&.ta_day_time&.try(:strftime, '%H:%M')
    elsif pay_type == 'ts_approve' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.sell_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'ts_approve' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.sell_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'ts_approve' && pay_schedule == 'twice a month'
      'On ' + @contract.sell_contract&.ta_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.sell_contract&.ta_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.ta_date_2).to_s + (' End of month' if @contract.sell_contract&.ta_end_of_month).to_s
    elsif pay_type == 'ts_approve' && pay_schedule == 'monthly'
      'On ' + (@contract.sell_contract&.ta_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.ta_date_1).to_s + (' End of month' if @contract.sell_contract&.ta_end_of_month).to_s

      # for salary calculation
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'immediately'
      ''
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'daily'
      'At ' + @contract.sell_contract&.invoice_day_time&.try(:strftime, '%H:%M').to_s
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'weekly'
      'Every ' + Date.parse(@contract.sell_contract&.invoice_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'biweekly'
      'Every ' + Date.parse(@contract.sell_contract&.invoice_day_of_week&.titleize).try(:strftime, '%A')
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'twice a month'
      'On ' + @contract.sell_contract&.invoice_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s + ' and ' + (@contract.sell_contract&.invoice_date_2&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.invoice_date_2).to_s + (' End of month' if @contract.sell_contract&.invoice_end_of_month).to_s
    elsif pay_type == 'invoice_terms_period' && pay_schedule == 'monthly'
      'On ' + (@contract.sell_contract&.invoice_date_1&.try(:strftime, '%e').to_i.ordinalize.to_s if @contract.sell_contract&.invoice_date_1).to_s + (' End of month' if @contract.sell_contract&.invoice_end_of_month).to_s

    else
      ''
    end
  end

  def get_initial(name_text)
    name_text&.first&.capitalize
  end

  def image_alt(user = nil)
    "#{get_initial(user.first_name)}.#{get_initial(user.last_name)}"
  rescue StandardError
    'N/A'
  end

  def bind_initials(first_name, last_name)
    content_tag(:span, get_initial(first_name) + '.' + get_initial(last_name), title: first_name.capitalize + ' ' + last_name.capitalize).html_safe
  end

  def colorfull_text(value, color_code)
    content_tag(:span, value, style: "color: #{color_code}")
  end

  def default_user_img(first_name, last_name, circle_div_class = 'circle')
    content_tag(:span, bind_initials(first_name, last_name), class: circle_div_class.to_s)
  end

def user_avatar(user)
if user.has_attribute?("online_candidate_status") == true
return if user.nil?
user_id = "candidate_id_" + user.id.to_s
if user.online_candidate_status == "online"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "in_a_meeting"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "onway"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "offline" || user.online_candidate_status == nil
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
elsif user.has_attribute?("online_user_status") == true
return if user.nil?
if user.online_user_status == "online"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "in_a_meeting"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "onway"
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "offline" || user.online_user_status == nil
if user.photo&.present?
user_id = "user_id_" + user.id.to_s
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
else
if user.photo&.present?
user_id = "user_id_" + user.id.to_s
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe
end
end
end



def user_mini_avatar(user)
return if user.nil?
if user.photo&.present?
image_tag(user.photo, alt: image_alt(user), class: 'figure-img img-fluid rounded-circle').html_safe
else
image_tag(asset_path('avatars/male.png'), alt: "user", class: 'figure-img img-fluid rounded-circle').html_safe
end
end




def user_image(user, attrs)
if user.present?
if user.has_attribute?("online_candidate_status") == true
return if user.nil?
user_id = "candidate_id_" + user.id.to_s
if user.online_candidate_status == "online"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "in_a_meeting"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "onway"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "offline" || user.online_candidate_status == nil
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
elsif user.has_attribute?("online_user_status") == true
return if user.nil?
user_id = "user_id_" + user.id.to_s
if user.online_user_status == "online"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "in_a_meeting"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "onway"
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "offline" || user.online_user_status == nil
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
else
if user.photo&.present? 
image_tag(user.photo, style: (attrs[:style]).to_s, class: "img-icon-size data-table-image #{attrs[:class]} company-div-style-7", title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name, 'circle', attrs[:class]) + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
end
end



def user_image_mini_chat(user, attrs)
if user.has_attribute?("online_candidate_status") == true
return if user.nil?
user_id = "candidate_id_" + user.id.to_s
if user.online_candidate_status == "online"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "in_a_meeting"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "onway"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_candidate_status == "offline" || user.online_candidate_status == nil
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
elsif user.has_attribute?("online_user_status") == true
return if user.nil?
user_id = "user_id_" + user.id.to_s
if user.online_user_status == "online"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='online_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='online_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "in_a_meeting"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='in_meeting_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "onway"
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='onway_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='onway_class' id='#{user_id}'></div>".html_safe
end
elsif user.online_user_status == "offline" || user.online_user_status == nil
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe + "<div class='offline_class' id='#{user_id}'></div>".html_safe
else
entity_image(user.first_name, user.last_name ) + "<div class='offline_class' id='#{user_id}'></div>".html_safe
end
end
else
if user.photo&.present?
image_tag(user.photo, style: (attrs[:style]).to_s, title: (attrs[:title]).to_s, alt: image_alt(user)).html_safe 
else
entity_image(user.first_name, user.last_name )
end
end
end

def entity_image(first_name, last_name, circle_div_class = 'circle', default_img_classes = '')
if first_name == '' || last_name == ''
image_tag(asset_path('avatars/camera-default.png'), class: "circle-images #{default_img_classes}" )
else
default_user_img(first_name, last_name, circle_div_class)
end
end

def show_users(users, width = 32, height = 32)
user_photo = ''
user_photo += "<div class='contracts_mini_chat_users pl-1 d-flex' style=''>"
user_photo += "<div class='table_avatar'>"
user_photo += if users&.signable&.photo.blank?
entity_image(users.signable.first_name, users.signable.last_name, 'avatar_circle')
else
"<img src='#{users.signable&.photo}' title='#{users.signable.full_name}' style='width:#{width}px; height:#{height}px;'>"
end
user_photo += '</div>'

users.signers&.take(3).each do |signer|
user_photo += "<div class='table_avatar'>"
user_photo += if signer.photo.blank?
entity_image(signer.first_name, signer.last_name, 'avatar_circle')
else
"<img src='#{signer.photo}' title='#{signer.full_name}' style='width:#{width}px; height:#{height}px;'>"
end
user_photo += '</div>'
end

user_photo += "<div class='more_users'>#{(users.signers&.count - 3).abs} More</div>" if users.signers&.count > 3
user_photo += '</div>'
user_photo.html_safe
end
end
def contact_widget_user(user)
contact_widget(user.email, user.phone, nil, color: '#3E4B5B; !important', chat_link: chat_link(user))
end
