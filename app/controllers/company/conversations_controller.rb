# frozen_string_literal: true

class Company::ConversationsController < Company::BaseController
  skip_before_action :authenticate_user!, only: :search
  before_action :find_attachments, :find_signers, only: [:chat_docusign]
  add_breadcrumb 'Dashboard', :dashboard_path
  $the_array = []
  def index
    
    add_breadcrumb 'Inbox'
    respond_to do |format|
      @query = nil
      @topic = nil
      format.html do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq{ |c| c.chatable_id}.uniq{ |c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15)
        # @conversation = Conversation.find(228)
        @conversation = params[:conversation].present? ? Conversation.where(sub_chats: false).find(params[:conversation]) : @conversations.first
        @favourites = current_user.favourables.uniq
        set_activity_for_job_application
      end
      format.js do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq.paginate(page: params[:page], per_page: 10)
      end
    end
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
  end

  def mini_chat
    @conversation = params[:conversation_id].present? ? Conversation.find_by(id: params[:conversation_id]) : create_or_find_conversation
  end

  def chat_docusign
    @conversation = Conversation.find_by(id: params[:conversation_id])
    @plugin = current_company.plugins.docusign.first
    main_signer = get_main_signer
    co_signers = params[:signers]
    co_signers&.pop
    response = true # (Time.current - @plugin.updated_at).to_i.abs / 3600 <= 5 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      @company_candidate_docs.each do |sign_doc|
        @document_sign = current_company.document_signs.create(
          requested_by: current_user,
          documentable: sign_doc,
          signable: main_signer,
          is_sign_done: false,
          part_of: @conversation,
          signers_ids: co_signers.to_s.tr('[', '{').tr(']', '}')
        )
        result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
        if !result.is_a?(Hash) && (result.status == 'sent')
          @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
          flash.now[:success] = 'Document is submitted to the candidate for signature'
        else
          @document_sign.destroy
          error = eval(result[:error_message])
          flash.now[:errors] = ["#{error[:errorCode]}: #{error[:message]}"]
        end
      end
      flash[:success] = 'Document is submitted to the candidate for signature'
    else
      flash[:errors] = ['Docusign token request failed, please regenerate the token from integrations']
    end
    redirect_to company_conversations_path(conversation: params[:conversation_id])
  end

  def create
    @conversation = Conversation.where(id: params[:conversation]).first
    @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order('created_at desc') if @conversation.job_application.present?
    @favourites = current_user.favourables
    @conversation.conversation_messages.where.not(userable_id: current_user.id).update_all(is_read: true)
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html do
        render 'index'
      end
      format.js
    end
  end

  # def update_company_conversation_title
  #   group_data = Group.find_by(id: params[:group_id])
  #   group_data.update(branchout: params[:branchout])
  #   respond_to do |format|
  #     format.js {render inline: "location.reload();" }
  #   end
  # end

  def update_company_conversation_title
    group_data = Group.find_by(id: params[:group_id])
    conversation_data = Conversation.find_by(id: params[:con_id])
    sub_group_name = params[:branch_array]  + ", "+ current_user.first_name 
    sub_company_id = current_company.id
    sub_member_type = group_data.member_type
    sub_bench_array = group_data.branch_array
    group_data_sub = Group.create(group_name: sub_group_name, company_id: sub_company_id, member_type: sub_member_type, branch_array: sub_bench_array)
   
    chatable_type_sub = conversation_data.chatable_type
    chatable_id_sub = group_data_sub.id
    

    conversation_data_sub  = Conversation.last.update(chatable_type: chatable_type_sub, chatable_id: chatable_id_sub, sub_chats: true, main_chat_ids: params[:con_id])
    conversation_data_sub  = Conversation.last
   new_sub_chat = {
      sub_chats: conversation_data_sub.id,
      chat_title: params[:branch_array],
    }
    group_data_branchout = group_data.branch_array.present? ? group_data.branch_array << new_sub_chat : group_data.branch_array = ( [] << new_sub_chat )
    group_data.update(branch_array: group_data_branchout)
    
    ids = Group.find(params[:group_id]).branch_array.map {|x| eval(x)[:sub_chats]}
    bb = Conversation.find(ids).pluck(:chatable_id)
    Group.where(id: bb).map {|m| m.update(branch_array: group_data_branchout) }

    directoryid = current_user.id
    chatctype = conversation_data_sub.chatable_type
    chatcid = group_data_sub.id
    chatconversation = conversation_data_sub.id
    add_to_chat_action( params , directoryid, chatctype, chatcid, chatconversation )
    # redirect_back(fallback_location: current_company.etyme_url)
    
    # b = Conversation.create(senderable_type: a.senderable_type, senderable_id: a.senderable_id, recipientable_type: a.recipientable_type, recipientable_id: a.recipientable_id, topic: a.topic, chatable_type: a.chatable_type, chatable_id: a.chatable_id, job_application_id: a.job_application_id, job_id: a.job_id, buy_contract_id: a.buy_contract_id, sell_contract_id:a. sell_contract_id)
    # c = Conversation.create()
    
    respond_to do |format|
      format.js {render inline: "location.reload();" }
    end
    
  end

  def delete_company_conversation_title
    conversation_data = Conversation.find_by(id: params[:conversation_id])
    conversation_data.update(freeze_chats: true)
    # code to remove id from branch out column 
    respond_to do |format|
      format.js {render inline: "location.reload();" }
    end
  end  


  def posposal_chats
  
    con = Conversation.where(current_user_id: current_user.id,  )
    group_name = current_user.first_name + " " + current_user.last_name + ","+ first_name + last_name
    company_id = current_company.id
    member_type = "Chat"
    group_data = Group.create(group_name: group_name, company_id: company_id, member_type: member_type)
    
    directoryid = current_user.id
    chatctype = "Group"
    chatcid = group_data.id
    chatconversation = Conversation.last
    add_to_chat_action( params , directoryid, chatctype, chatcid, chatconversation )
    directoryid = params[:user_id]
    add_to_chat_action( params , directoryid, chatctype, chatcid, chatconversation )

    
  end




  def search
    @query = params[:keyword]
    @topic = params[:topic].present? ? params[:topic] : 'All' 
    

    
    @conversations = if @query.present? && @topic.present?
                       @topic == 'All' ?
                        Conversation.conversation_of(current_company, @query, online_user).paginate(page: params[:page], per_page: 15) :
                        Conversation.send(@topic).conversation_of(current_company, @query, online_user).paginate(page: params[:page], per_page: 15)
                     else
                       @topic == 'All' ?
                        Conversation.all_onversations(current_user).uniq{ |c| c.chatable_id}.uniq{ |c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15) :
                        Conversation.send(@topic).all_onversations(online_user).paginate(page: params[:page], per_page: 15)
                     end
    # group_ids = Group.user_chat_groups(online_user, current_company).ids
    # debugger
    # @conversationsselect { |con| group_ids.include?(con.chatable_id) }
  end

  def add_to_favourite
    @favourite = current_user.favourables.create(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id])
  end

  def remove_from_favourite
    favourable = current_user.favourables.where(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id]).first
    @user = favourable.favourabled
    favourable.destroy
  end

  def add_to_chat 
    
    binding.pry
    
    conversation = Conversation.find(params[:chatconversation])
    if params[:directoryid].present?
      user = current_company.users.where(id: params[:directoryid]).first
    elsif params[:candidateid].present?
      if current_company.candidates.where(id: params[:candidateid]).first.nil?
        user = add_candidate(params[:candidateid])
      else
        user = current_company.candidates.where(id: params[:candidateid]).first
      end
    elsif params[:contactid].present?
      if current_company.company_contacts.where(id: params[:contactid]).first.nil?
        new_contact = add_new_contact(params[:contactid].to_s)
        user = new_contact.user
      else
        user = current_company.company_contacts.where(id: params[:contactid]).first.user
      end
    else
      flash[:error] = 'Select any one option.'
      redirect_to company_conversations_path(conversation: conversation.id)
      return
    end
    if params[:chatctype] == 'Group'
      group = Group.find(params[:chatcid])
      if group.groupables.create(groupable: user)
        flash[:success] = 'Member is added to the group'
      else
        flash[:errors] = group.errors.full_messages
      end
    else
      user1 = if params[:chatctype] == 'Candidate'
                Candidate.where(id: params[:chatcid]).first
              elsif params[:chatctype] == 'Company'
                Company.where(id: params[:chatcid]).first
              else
                User.find(params[:chatcid])
              end
      name = current_user.full_name + ', ' + user.full_name + ', ' + user1.full_name
      group = Group.create(group_name: name, company_id: current_company.id, member_type: 'Chat')
      group.groupables.create(groupable: current_user)
      group.groupables.create(groupable: user)
      group.groupables.create(groupable: user1)
      conversation.update(chatable: group, topic: 'GroupChat')
    end
    redirect_back(fallback_location: current_company.etyme_url)
  end

  def mute
    conversation = Conversation.find(params[:id])
    ConversationMute.create(conversation: conversation, mutable: current_user)
    redirect_to company_conversations_path(conversation: conversation.id)
  end

  def unmute
    conversation = Conversation.find(params[:id])
    ConversationMute.where(conversation: conversation, mutable: current_user).destroy_all
    redirect_to company_conversations_path(conversation: conversation.id)
  end

  def chat_members
    @company_contacts = current_company.company_contacts.map{|cc| {email: cc.email, id: cc.id, name: cc.full_name}}
    render status: 200, json: {
        message: 'Success!',
        data: @company_contacts
    }
  end
  def chat_candidates
    @candidates = current_company.candidates.map{|cc| {email: cc.email, id: cc.id, name: cc.full_name}}
    render status: 200, json: {
        message: 'Success!',
        data: @candidates
    }
  end


  private

    def add_to_chat_action(params, directoryid, chatctype, chatcid, chatconversation )

    conversation = Conversation.find(chatconversation)
    if directoryid.present?
      user = current_company.users.where(id: directoryid).first
    elsif params[:candidateid].present?
      if current_company.candidates.where(id: params[:candidateid]).first.nil?
        user = add_candidate(params[:candidateid])
      else
        user = current_company.candidates.where(id: params[:candidateid]).first
      end
    elsif params[:contactid].present?
      if current_company.company_contacts.where(id: params[:contactid]).first.nil?
        new_contact = add_new_contact(params[:contactid].to_s)
        user = new_contact.user
      else
        user = current_company.company_contacts.where(id: params[:contactid]).first.user
      end
    else
      flash[:error] = 'Select any one option.'
      redirect_to company_conversations_path(conversation: conversation.id)
      return
    end
    if chatctype == 'Group'
      group = Group.find(chatcid)
      if group.groupables.create(groupable: user)
        flash[:success] = 'Member is added to the group'
      else
        flash[:errors] = group.errors.full_messages
      end
    else
      user1 = if chatctype == 'Candidate'
                Candidate.where(id: chatcid).first
              elsif chatctype == 'Company'
                Company.where(id: chatcid).first
              else
                User.find(chatcid)
              end
      name = current_user.full_name + ', ' + user.full_name + ', ' + user1.full_name
      group = Group.create(group_name: name, company_id: current_company.id, member_type: 'Chat')
      group.groupables.create(groupable: current_user)
      group.groupables.create(groupable: user)
      group.groupables.create(groupable: user1)
      conversation.update(chatable: group, topic: 'GroupChat')
    end
  end

  def add_new_contact(email)
    begin
      CompanyContact.transaction do
        email = email.downcase
        next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?
        user = DiscoverUser.new.discover_user(email)
        contact = current_company.company_contacts.where(user: user).first_or_initialize(created_by: current_user, user_company: user.company, email: user.email)
        contact.save! unless contact.persisted?
        return contact
      end
    rescue ActiveRecord::RecordInvalid
      flash[:errors] = ["Please check the contacts' email formats and try again"]
    end
  end

  def add_candidate(email)
    begin
      CompanyContact.transaction do
        email = email.downcase
        next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?
        candidate = DiscoverUser.new.discover_candidate(email)
        company_candidate = current_company.candidates_companies.normal.where(candidate: candidate).first_or_initialize(candidate: candidate)
        company_candidate.save! unless company_candidate.persisted?
        return candidate
      end
    rescue ActiveRecord::RecordInvalid
      flash[:errors] = ["Please check the candidates' email formats and try again"]
    end
  end

  def find_mini_chat_user
    params[:utype].constantize.find_by(id: params[:uid])
  end

  def create_or_find_conversation
    @chat_with = find_mini_chat_user
    user_groups = Group.where(member_type: 'Chat').joins(user_or_admin(current_user)).where('groupables.groupable_id = ?', current_user.id).ids
    chat_with_groups = Group.where(member_type: 'Chat').joins(user_or_admin(@chat_with)).where('groupables.groupable_id = ?', @chat_with.id).ids
    groups = user_groups & chat_with_groups
    conversation = Conversation.OneToOne.where(chatable_id: groups).first
    conversation || create_one_to_one_conversation
  end

  def create_one_to_one_conversation
    group = current_company.groups.create(group_name: "#{@chat_with.full_name} #{current_user.full_name}", member_type: 'Chat')
    group.groupables.create(groupable: @chat_with)
    group.groupables.create(groupable: current_user)
    Conversation.OneToOne.create(chatable: group)
  end

  def set_activity_for_job_application
    @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order('created_at desc') if @conversation&.job_application.present?
  end

  def online_user
    current_user.present? ? current_user : current_candidate
  end

  def find_attachments
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
  end

  def find_signers
    @signers = current_company.users.where(id: params[:signers])
  end

  def get_main_signer
    candidate = @conversation.chatable.groupables.where(groupable_type: 'Candidate').first.groupable
    candidate.present? ? candidate : current_company.users.find_by(id: params[:signers]&.last)
  end

  # private

  # def set_conversation(user)
  #   ConversationMessage.unread_messages(user, current_user).update_all(is_read: true)
  #   if Conversation.between(current_user, user).present?
  #     @conversation = Conversation.between(current_user, user).first
  #   else
  #     @conversation = Conversation.create!({senderable: current_user, recipientable: user})
  #   end
  # end

  # def set_conversation(user, chat_topic, chatable_id, chatable_type)
  #   if chat_topic == "Group"
  #     GroupMsgNotify.where(group_id: user.id, member_type: current_user.class.to_s, member_id: current_user.id).update_all(is_read: true)
  #     if Conversation.where(chatable: user, topic: "GroupChat").present?
  #       @conversation = Conversation.where(chatable: user, topic: "GroupChat").first
  #     else
  #       @conversation = Conversation.create!({chatable: user, topic: "GroupChat"})
  #     end
  #   else
  #     ConversationMessage.unread_messages(user, current_user).where(conversations: {chatable_id: chatable_id, chatable_type: chatable_type}).update_all(is_read: true)
  #     if Conversation.between(current_user, user).where(chatable_id: chatable_id, chatable_type: chatable_type).present?
  #       @conversation = Conversation.between(current_user, user).where(chatable_id: chatable_id, chatable_type: chatable_type).first
  #     else
  #       if chatable_type == "Job"
  #         @conversation = Conversation.create(senderable: current_user, recipientable: user, chatable_id: chatable_id, chatable_type: chatable_type)
  #         Job.find(chatable_id).update_attributes(conversation_id: @conversation.id)
  #       else
  #         @conversation = Conversation.find_by(recipientable_id: user.id, senderable_id: current_user.id)
  #         @conversation ||= Conversation.create!({senderable: current_user, recipientable: user, chatable_id: chatable_id, chatable_type: chatable_type})
  #       end
  #     end
  #   end
  # end

  # def get_conversation_users
  #   # user_ids = Conversation.where("(senderable_type in (?) AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type in (?) AND recipientable_id = ? AND senderable_type = 'Candidate')", ["User", "Admin"], current_user.id, ["User", "Admin"], current_user.id).pluck(:senderable_id, :recipientable_id).flatten
  #   # @candidates = Candidate.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
  #   #
  #   # user_ids = Conversation.where("(senderable_type in (?) AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type in (?) AND recipientable_id = ? AND senderable_type != 'Candidate')", ["User", "Admin"], current_user.id, ["User", "Admin"], current_user.id).pluck(:senderable_id, :recipientable_id).flatten
  #   # @companies = User.where.not(id: current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
  #   #
  #   # @favourites = current_user.favourables
  #   #
  #   # @groups = current_user.groups
  #   @conversations =  Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", "User", current_user.id, "User", current_user.id).order("conversation_messages.created_at DESC").uniq
  # end
end
