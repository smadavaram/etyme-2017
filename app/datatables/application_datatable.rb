class ApplicationDatatable < AjaxDatatablesRails::ActiveRecord
  extend Forwardable

  def_delegator :@view, :link_to
  def_delegator :@view, :content_tag
  def_delegator :@view, :edit_polymorphic_path
  def_delegator :@view, :polymorphic_path
  def_delegator :@view, :current_user
  def_delegator :@view, :current_company
  def_delegator :@view, :image_tag
  def_delegator :@view, :mail_to
  def_delegator :@view, :company_statuses_path
  def_delegator :@view, :company_assign_status_path
  def_delegator :@view, :company_company_add_reminder_path
  def_delegator :@view, :company_contacts_company_companies_path
  def_delegator :@view, :company_company_assign_groups_to_contact_path
  def_delegator :@view, :contact_widget
  def_delegator :@view, :colorfull_text
  def_delegator :@view, :chat_link

  def initialize(params, opts = {})
    @view = opts[:view_context]
    super
  end

  def do_ellipsis(value, length = 20)
    if value
      post_fix = value.length > length ? '...' : ''
      content_tag(:span, "#{value[0..length].strip}#{post_fix}", class: 'ellipsis', title: value).html_safe
    end
  end

  def company_logo_and_name company
    image_tag(company.logo, class: "data-table-image").html_safe + " " + company.name
  end
  def get_initial(name_text)
       name_text.first.capitalize
  end

  def bind_initials(first_name,last_name)
    content_tag(:span, get_initial(first_name)+"."+get_initial(last_name), title: first_name+" "+last_name).html_safe
  end

  def colorfull_text(value,color_code)
    content_tag(:span, value, style: "color: #{color_code}")
  end
  def default_user_img(first_name,last_name,circle_div_class='circle')
      content_tag(:span, bind_initials(first_name,last_name),class: "#{circle_div_class}")
    end
  def entity_image(first_name,last_name,circle_div_class='circle',default_img_classes='')
    default_img =''
    if first_name=='' || last_name=='' 
        default_img = default_img+ "<img src='#{ActionController::Base.helpers.asset_path('avatars/m_sunny_big.png')}' alt= '#{first_name} #{last_name}' class='#{default_img_classes}'/>"
      else
        default_img = default_img + default_user_img(first_name,last_name,circle_div_class)
      end
    return default_img.html_safe
  end


end
