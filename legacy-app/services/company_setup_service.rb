# frozen_string_literal: true

class CompanySetupService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def create_new_company(company_params, contact_params)
    new_company = Company.new(company_params)
    if new_company.save
      create_company_contact(new_company, contact_params)
      { success: true, company: new_company }
    else
      { success: false, errors: new_company.errors.full_messages }
    end
  end

  def create_company_contact(target_company, contact_params)
    return { success: false, errors: ['No contact params'] } unless @company && contact_params.present?

    contact_params.to_h.map do |_key, contact_hash|
      user_params = contact_hash.slice(:first_name, :last_name, :email)
      user = User.find_by_email(contact_hash['email']) || Admin.create(user_params.merge(company_id: target_company.id))
      @company.company_contacts.create!(contact_hash.except(:_destroy).merge(user_id: user.id, user_company_id: user.company.id, created_by_id: @current_user.id))
    end.all?
    { success: true }
  rescue => e
    { success: false, error: e.message }
  end

  def add_company_admin(target_company, admin_hash)
    admin_hash = admin_hash.slice(:first_name, :last_name, :email)
    company_admin = target_company.admins.build(admin_hash)
    company_admin.role_ids = Array(Role.all.joins(:permissions).where('permissions.name = ?', 'manage_all').pluck(:id).first)
    if company_admin.save
      { success: true }
    else
      { success: false, errors: ['Cannot Process!'] }
    end
  end

  def add_new_company_admin(target_company, admin_hash)
    contact_hash = admin_hash.slice(:first_name, :last_name, :email, :phone, :title)
    admin_params = admin_hash.slice(:first_name, :last_name, :email)
    company_admin = target_company.admins.build(admin_params)
    company_admin.save
    if target_company.try(:owner_id).nil? && target_company.try(:admins).count == 1
      target_company.update(owner_id: company_admin.id)
      add_contact_to_current_company(contact_hash)
    end
    { success: true }
  end

  def add_contact_to_current_company(contact_hash)
    contact_hash = contact_hash.slice(:first_name, :last_name, :email, :phone, :title)
    company_contact = @company.company_contacts.build(contact_hash.merge(created_by_id: @current_user.id))
    company_contact.save
    { success: company_contact.persisted? }
  end

  def add_contact_to_company(target_company, contact_hash)
    user_params = contact_hash.slice(:first_name, :last_name, :email, :phone)
    user = User.find_by_email(contact_hash['email']) || User.create(user_params.merge(company_id: target_company.id))
    company_contact = @company.company_contacts.build(contact_hash.merge(user_id: user.id, user_company_id: user.company.id, created_by_id: @current_user.id))
    { success: company_contact.save }
  end

  def verify_website(url, verification_code)
    require 'openssl'
    begin
      doc = Nokogiri::HTML(open("#{url}/verifyetyme.html", ssl_verify_mode: OpenSSL::SSL::VERIFY_NONE))
      if !doc.css('a')[0].nil?
        if verification_code == doc.css('a')[0].text
          @company.update_attributes(owner_verified: true)
          { success: true, message: 'Verify Successfully' }
        else
          { success: false, message: 'Verification code does not match.' }
        end
      else
        { success: false, message: 'File not found.' }
      end
    rescue StandardError
      { success: false, message: 'File not found.' }
    end
  end

  def assign_groups(record, group_ids)
    groups = group_ids.reject(&:empty?)
    groups_id = groups.map(&:to_i)
    record.update_attribute(:group_ids, groups_id)
    if record.save
      { success: true, message: 'Groups has been assigned' }
    else
      { success: false, errors: record.errors.full_messages }
    end
  end
end
