# frozen_string_literal: true

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
  def_delegator :@view, :get_initial
  def_delegator :@view, :bind_initials
  def_delegator :@view, :colorfull_text
  def_delegator :@view, :do_ellipsis
  def_delegator :@view, :default_user_img
  def_delegator :@view, :user_image
  def_delegator :@view, :image_alt
  def_delegator :@view, :entity_image

  def initialize(params, opts = {})
    @view = opts[:view_context]
    super
  end

  def company_logo_and_name(company)
    image_tag(company.logo, class: 'data-table-image').html_safe + ' ' + company.name
  end
end
