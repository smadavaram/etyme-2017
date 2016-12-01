# :nodoc:
module ApplicationHelper
  def left_menu
    left_menu_entries(left_menu_content)
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
      children_selected = entry[:children] &&
          entry[:children].any? {|child| current_page?(child[:href]) }
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
            href: root_path,
            title: 'HOME',
            content: "<i class='fa fa-lg fa-fw fa-home'></i> <span class='menu-item-parent'>" + 'HOME' + "</span>",
        },
        {
            href: new_consultant_path,
            title: 'CONSULTANTS',
            content: "<i class='fa fa-lg fa-fw fa-users'></i> <span class='menu-item-parent'>" + 'CONSULTANTS' + "</span>",
        },
        {
            href: '#',
            title: 'JOBS',
            content: "<i class='fa fa-lg fa-fw fa-briefcase'></i> <span class='menu-item-parent'>" + 'JOBS' + "</span>",
            children: [
                {
                    href: jobs_path,
                    title: 'Jobs',
                    content: "<span class='menu-item-parent'> Jobs </span>"
                },
                {
                    href: job_invitations_path,
                    title: 'Job Invitations',
                    content: "<span class='menu-item-parent'> Job Invitations </span>"
                },
                {
                    href: job_applications_path,
                    title: 'Job Applications',
                    content: "<span class='menu-item-parent'> Job Applications </span>"
                },
                {
                    href: contracts_path,
                    title: 'Contracts',
                    content: "<span class='menu-item-parent'> Contracts </span>"
                },
            ]
        },
        {
            href: vendors_path,
            title: 'VENDORS',
            content: "<i class='fa fa-lg fa-fw fa-black-tie'></i> <span class='menu-item-parent'>" + 'VENDORS' + "</span>",
        },
        {
            href: new_company_doc_path,
            title: 'Company Docs',
            content: "<i class='fa fa-lg fa-fw fa-black-tie'></i> <span class='menu-item-parent'>" + 'Company Docs' + "</span>",
        },
        # {
        #     href:  consultant_leaves_path(current_user),
        #     title: 'Leaves',
        #     content: "<i class='fa fa-lg fa-fw fa-black-tie'></i> <span class='menu-item-parent'>" + 'Leaves' + "</span>",
        # },
        # {
        #     href: employees_leaves_path ,
        #     title: 'Leaves',
        #     content: "<i class='fa fa-lg fa-fw fa-black-tie'></i> <span class='menu-item-parent'>" + 'Leaves' + "</span>",
        # },
        {
            href: '#',
            title: 'CONFIGURATION',
            content: "<i class='fa fa-lg fa-fw fa-gear'></i> <span class='menu-item-parent'>" + 'CONFIGURATION' + "</span>",
            children: [
                {
                    href: new_admin_path,
                    title: 'Admin',
                    content: "<span class='menu-item-parent'> Admins </span>"
                },
                {
                    href: attachments_path,
                    title: 'Company Documents',
                    content: "<span class='menu-item-parent'>Documents </span>"
                }
            ]
        },
    ]
  end

end
