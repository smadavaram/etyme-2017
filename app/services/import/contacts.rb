# frozen_string_literal: true

module Import
  class Contacts < Base
    include DomainExtractor

    attr_reader :contacts, :current_company, :current_user

    def initialize(contacts, company_id:, user_id:)
      @contacts = contacts || {}
      @current_company = Company.find_by(id: company_id)
      @current_user = User.find_by(id: user_id)
    end

    def call
      return if @current_company.blank?

      contacts.each do |contact|
        begin
          if candidate_email?(contact[:email])
            Rails.logger.info "Candidate Contact Import has been started for email #{contact[:email]}"
            create_candidate_account(contact)
          else
            Rails.logger.info "Company Contact Import has been started for email #{contact[:email]}"
            create_company_account(contact)
          end
        rescue StandardError => e
          Rails.logger.error "Import contact #{contact} failed due to exception #{e.message}"
        end
      end
    end

    private

    def create_candidate_account(contact)
      candidate = Candidate.find_by(email: contact[:email]) || current_company.candidates.new
      if candidate.new_record?
        candidate.email = contact[:email]
        candidate.first_name = contact[:first_name]
        candidate.last_name = contact[:last_name] || contact[:first_name]
        candidate.invited_by_id = current_user.id
        candidate.invited_by_type = 'User'
        candidate.send_welcome_email_to_candidate = false
        candidate.status = 'campany_candidate'
        if candidate.save
          current_company.candidates << candidate
          candidate.create_activity :create, owner: current_company, recipient: current_company
          CandidatesResume.create(candidate_id: candidate.id, resume: candidate.resume, is_primary: true)
        else
          Rails.logger.info "------Failed to save due to error #{candidate.errors.full_messages}-----"
        end
      else
        Rails.logger.info "------Candidate account already exists for email #{candidate.email} and company #{current_company.id}-----"
      end
    end

    def create_company_account(contact)
      if is_company_exist?(contact[:email])
        if current_company == @company
          company_admin = current_company.admins.build(email: contact[:email], first_name: contact[:first_name], last_name: contact[:last_name])
          company_admin.role_ids = Array(Role.all.joins(:permissions).where('permissions.name = ?', "manage_all").pluck(:id).first)
          if company_admin.save
            Rails.logger.info 'Company Admin saved successfully'
          else
            Rails.logger.info 'Error while saving company admin'
          end
        else
          unless current_company.company_contacts.pluck(:email).include? contact[:email]
            create_current_company_contact(contact)
          end
        end
      else
        create_new_company(contact)
      end
    end

    def is_company_exist?(email)
      @company = Company.find_by(website: domain_from_email(email))
    end

    def create_new_company(contact)
      company = Company.new
      company.name = contact[:company] || contact[:first_name] || contact[:last_name]
      company.company_type = 'vendor'
      company.website = domain_from_email(contact[:email])
      company.phone = ''
      company.domain = domain_name(contact[:email])
      if company.save
        Rails.logger.info "------Successfully created new company  #{company.inspect}-----"
        create_current_company_contact(contact)
        company.update_attribute(:owner_id, company.admins.first.id)
      else
        Rails.logger.info "------Failed to create new Company  #{company.errors.full_messages}-----"
      end
    end

    def create_current_company_contact(contact)
      user = User.find_by(email: contact[:email]) || Admin.create(
        first_name: contact[:first_name],
        last_name: contact[:last_name] || contact[:first_name],
        email: contact[:email],
        company_id: current_company.id
      )
      company_contact = company.company_contacts.build(
        email: contact[:email],
        first_name: contact[:first_name],
        last_name: contact[:last_name]
      )
      if company_contact.save
        Rails.logger.info "------Successfully created new company contact #{company_contact.inspect}-----"
      else
        Rails.logger.info "------Failed to create new Company contact #{company_contact.errors.full_messages}-----"
      end
    end

    def candidate_email?(email)
      domain = domain_name(email)
      Company::EXCLUDED_DOMAINS.include?(domain)
    end

  end
end