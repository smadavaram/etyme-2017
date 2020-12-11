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
        if candidate_email?(contact[:email])
          create_candidate_account(contact)
        else
          create_company_account(contact)
        end
      end
    end

    private


    #   @contacts=[
    #     {
    #       :id=>"http://www.google.com/m8/feeds/contacts/singh.nitin2502%40gmail.com/base/13ffa0f88f2a2ae2",
    #       :first_name=>"ns20130",
    #       :last_name=>nil,
    #       :name=>"ns20130",
    #       :emails=>[{:name=>"other", :email=>"ns20130@gmail.com"}],
    #       :gender=>nil,
    #       :birthday=>nil,
    #       :profile_picture=>"https://www.google.com/m8/feeds/photos/media/singh.nitin2502%40gmail.com/13ffa0f88f2a2ae2?&access_token=ya29.a0AfH6SMAHNK4-G6s3llthpqseYrt5YcT8GwzBuqzSC9imPg4K15aTKip7a6HU-zhWMdLUlWEKx07TZChRKgXnlZOcQb9ZabBUo2B3DzkkqlXGeZgd8MrX8tHjbG6HnAkwuvzLRmQIY4T_KloC0sts6w8la8lxI5VCW2xLYJjqy28v2TwLtYzGkQ",
    #       :relation=>nil,
    #       :addresses=>[],
    #       :phone_numbers=>[],
    #       :dates=>nil,
    #       :company=>nil,
    #       :position=>nil,
    #       :email=>"ns20130@gmail.com"
    #   },
    #   {
    #     :id=>"http://www.google.com/m8/feeds/contacts/singh.nitin2502%40gmail.com/base/1b81f6670e3dc1e7",
    #     :first_name=>"varmanitesh91",
    #     :last_name=>nil,
    #     :name=>"varmanitesh91",
    #     :emails=>[{:name=>"other", :email=>"varmanitesh91@gmail.com"}],
    #     :gender=>nil,
    #     :birthday=>nil,
    #     :profile_picture=>"https://www.google.com/m8/feeds/photos/media/singh.nitin2502%40gmail.com/1b81f6670e3dc1e7?&access_token=ya29.a0AfH6SMAHNK4-G6s3llthpqseYrt5YcT8GwzBuqzSC9imPg4K15aTKip7a6HU-zhWMdLUlWEKx07TZChRKgXnlZOcQb9ZabBUo2B3DzkkqlXGeZgd8MrX8tHjbG6HnAkwuvzLRmQIY4T_KloC0sts6w8la8lxI5VCW2xLYJjqy28v2TwLtYzGkQ",
    #     :relation=>nil,
    #     :addresses=>[],
    #     :phone_numbers=>[],
    #     :dates=>nil,
    #     :company=>nil,
    #     :position=>nil,
    #     :email=>"varmanitesh91@gmail.com"
    #   },
    # ]
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

    def candidate_email?(email)
      domain = domain_name(email)
      Company::EXCLUDED_DOMAINS.include?(domain)
    end

  end
end