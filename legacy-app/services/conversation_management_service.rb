# frozen_string_literal: true

class ConversationManagementService
  attr_reader :company, :user

  def initialize(company:, user:)
    @company = company
    @user = user
  end

  def find_or_create_mini_chat(params)
    if params[:candidate].present?
      find_or_create_candidate_chat(params[:candidate])
    elsif params[:recruiter].present?
      find_or_create_recruiter_chat(params[:recruiter])
    elsif params[:conversation_id].present?
      Conversation.find_by(id: params[:conversation_id])
    elsif params[:uid].present?
      Conversation.find_by(id: params[:uid])
    else
      find_or_create_one_to_one(User.find(params[:recruiter]))
    end
  end

  def add_member_to_chat(params)
    conversation = Conversation.find(params[:chatconversation])
    member = resolve_chat_member(params)
    return { success: false, error: 'Select any one option.' } unless member

    if params[:chatctype] == 'Group'
      add_to_group(Group.find(params[:chatcid]), member)
    else
      convert_to_group_chat(conversation, member, params[:chatctype], params[:chatcid])
    end
  end

  def create_branch_conversation(params)
    group_data = Group.find_by(id: params[:group_id])
    conversation_data = Conversation.find_by(id: params[:con_id])

    sub_group_name = params[:branch_array] + ", " + user.first_name
    group_data_sub = Group.create(
      group_name: sub_group_name,
      company_id: company.id,
      member_type: group_data.member_type,
      branch_array: group_data.branch_array
    )

    Conversation.last.update(
      chatable_type: conversation_data.chatable_type,
      chatable_id: group_data_sub.id,
      sub_chats: true,
      main_chat_ids: params[:con_id]
    )
    conversation_data_sub = Conversation.last

    new_sub_chat = {
      sub_chats: conversation_data_sub.id,
      chat_title: params[:branch_array]
    }
    group_data_branchout = group_data.branch_array.present? ? group_data.branch_array << new_sub_chat : [new_sub_chat]
    group_data.update(branch_array: group_data_branchout)

    ids = Group.find(params[:group_id]).branch_array.map { |x| eval(x)[:sub_chats] }
    bb = Conversation.find(ids).pluck(:chatable_id)
    Group.where(id: bb).map { |m| m.update(branch_array: group_data_branchout) }

    add_user_to_group(conversation_data_sub, group_data_sub)
    conversation_data_sub
  end

  def sign_chat_documents(conversation_id, doc_ids:, signers: nil)
    conversation = Conversation.find_by(id: conversation_id)
    plugin = company.plugins.first
    main_signer = get_main_signer(conversation)
    co_signers = signers&.dup
    co_signers&.pop

    unless plugin && ((Time.current - plugin.updated_at).to_i.abs / 3600 <= 2 || RefreshToken.new(plugin).refresh_docusign_token.present?)
      return { success: false, error: 'Docusign token request failed, please regenerate the token from integrations' }
    end

    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    results = company_candidate_docs.map do |sign_doc|
      document_sign = company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: main_signer,
        is_sign_done: false,
        part_of: conversation,
        signers_ids: co_signers.to_s.tr('[', '{').tr(']', '}')
      )

      if document_sign.is_signable?
        result = DocusignEnvelope.new(document_sign, plugin).create_envelope
        if !result.is_a?(Hash) && (result.status == 'sent')
          document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
          { success: true }
        else
          document_sign.destroy
          error = eval(result[:error_message])
          { success: false, error: "#{error[:errorCode]}: #{error[:message]}" }
        end
      else
        { success: true }
      end
    end

    { success: true, results: results }
  end

  private

  def find_or_create_candidate_chat(candidate_id)
    con = Conversation.where(current_user_id: user.id, candidate_id: candidate_id)
    if con.present?
      { conversation: con.last, candidate: Candidate.find_by(id: candidate_id) }
    else
      candidate = Candidate.find_by(id: candidate_id)
      group = create_chat_group("#{user.first_name} #{user.last_name},#{candidate.first_name}#{candidate.last_name}")
      porposal_id = PorposalChat.create(company_id: company.id)
      Conversation.last.update(current_user_id: user.id, porposal_chat_id: porposal_id.id, candidate_id: candidate_id)
      conversation = Conversation.last

      add_user_to_group(conversation, group)
      add_candidate_to_group(conversation, group, candidate.id)

      { conversation: Conversation.find_by(id: conversation.id), candidate: candidate }
    end
  end

  def find_or_create_recruiter_chat(recruiter_id)
    con = Conversation.where(current_user_id: user.id, recruiter_id: recruiter_id)
    if con.present?
      { conversation: con.last, candidate: User.find_by(id: recruiter_id) }
    else
      recruiter = User.find_by(id: recruiter_id)
      group = create_chat_group("#{user.first_name} #{user.last_name},#{recruiter.first_name}#{recruiter.last_name}")
      porposal_id = PorposalChat.create(company_id: company.id)
      Conversation.last.update(current_user_id: user.id, porposal_chat_id: porposal_id.id, recruiter_id: recruiter_id)
      conversation = Conversation.last

      add_user_to_group(conversation, group, recruiter.id)

      { conversation: Conversation.find_by(id: conversation.id), candidate: recruiter }
    end
  end

  def find_or_create_one_to_one(chat_with)
    user_groups = Group.where(member_type: 'Chat').joins(user_or_admin(user)).where('groupables.groupable_id = ?', user.id).ids
    chat_with_groups = Group.where(member_type: 'Chat').joins(user_or_admin(chat_with)).where('groupables.groupable_id = ?', chat_with.id).ids
    groups = user_groups & chat_with_groups
    conversation = Conversation.OneToOne.where(chatable_id: groups).first
    conversation || create_one_to_one_conversation(chat_with)
  end

  def create_one_to_one_conversation(chat_with)
    group = company.groups.create(group_name: "#{chat_with.full_name} #{user.full_name}", member_type: 'Chat')
    group.groupables.create(groupable: chat_with)
    group.groupables.create(groupable: user)
    Conversation.OneToOne.create(chatable: group)
  end

  def create_chat_group(name)
    Group.create(group_name: name, company_id: company.id, member_type: "Chat")
  end

  def add_user_to_group(conversation, group, directory_id = nil)
    dir_id = directory_id || user.id
    member = company.users.where(id: dir_id).first
    return unless member

    group = Group.find(group.is_a?(Group) ? group.id : conversation.chatable_id)
    group.groupables.create(groupable: member)
  end

  def add_candidate_to_group(conversation, group, candidate_id)
    candidate = company.candidates.where(id: candidate_id).first
    return unless candidate

    group_record = Group.find(group.is_a?(Group) ? group.id : conversation.chatable_id)
    group_record.groupables.create(groupable: candidate)
  end

  def resolve_chat_member(params)
    if params[:directoryid].present?
      company.users.where(id: params[:directoryid]).first
    elsif params[:candidateid].present?
      candidate = company.candidates.where(id: params[:candidateid]).first
      candidate || add_candidate(params[:candidateid])
    elsif params[:contactid].present?
      contact = company.company_contacts.where(id: params[:contactid]).first
      if contact
        contact.user
      else
        new_contact = add_new_contact(params[:contactid].to_s)
        new_contact&.user
      end
    end
  end

  def add_to_group(group, member)
    if group.groupables.create(groupable: member)
      { success: true, message: 'Member is added to the group' }
    else
      { success: false, errors: group.errors.full_messages }
    end
  end

  def convert_to_group_chat(conversation, new_member, chatable_type, chatable_id)
    existing_member = case chatable_type
                      when 'Candidate' then Candidate.where(id: chatable_id).first
                      when 'Company' then Company.where(id: chatable_id).first
                      else User.find(chatable_id)
                      end
    name = "#{user.full_name}, #{new_member.full_name}, #{existing_member.full_name}"
    group = Group.create(group_name: name, company_id: company.id, member_type: 'Chat')
    group.groupables.create(groupable: user)
    group.groupables.create(groupable: new_member)
    group.groupables.create(groupable: existing_member)
    conversation.update(chatable: group, topic: 'GroupChat')
    { success: true }
  end

  def add_new_contact(email)
    CompanyContact.transaction do
      email = email.downcase
      return nil unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

      discovered_user = DiscoverUser.new.discover_user(email)
      contact = company.company_contacts.where(user: discovered_user).first_or_initialize(
        created_by: user, user_company: discovered_user.company, email: discovered_user.email
      )
      contact.save! unless contact.persisted?
      contact
    end
  rescue ActiveRecord::RecordInvalid
    nil
  end

  def add_candidate(candidate_id)
    CompanyContact.transaction do
      candidate_id = candidate_id.downcase
      return nil unless (candidate_id =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

      candidate = DiscoverUser.new.discover_candidate(candidate_id)
      company_candidate = company.candidates_companies.normal.where(candidate: candidate).first_or_initialize(candidate: candidate)
      company_candidate.save! unless company_candidate.persisted?
      candidate
    end
  rescue ActiveRecord::RecordInvalid
    nil
  end

  def get_main_signer(conversation)
    candidate = conversation.chatable.groupables.where(groupable_type: 'Candidate')&.first&.groupable
    candidate.present? ? candidate : company.users.find_by(id: nil)
  end

  def user_or_admin(user_record)
    if user_record.is_a?(Admin)
      :admin_groupables
    else
      :user_groupables
    end
  end
end
