class Company::ConversationsController < Company::BaseController

  skip_before_action :authenticate_user!, only: :search
  before_action :find_attachments, :find_signers, only: [:chat_docusign]

  def index
    @conversations = Conversation.all_onversations(current_user).uniq
    @conversation = params[:conversation].present? ? Conversation.find(params[:conversation]) : @conversations.first
    @favourites = current_user.favourables.uniq
    set_activity_for_job_application
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
    response = true #(Time.current - @plugin.updated_at).to_i.abs / 3600 <= 5 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      @company_candidate_docs.each do |sign_doc|
        @document_sign = current_company.document_signs.create(
            requested_by: current_user,
            documentable: sign_doc,
            signable: main_signer,
            is_sign_done: false,
            part_of: @conversation,
            signers_ids: co_signers.to_s.gsub('[', '{').gsub(']', '}')
        )
        result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
        if (result.status == "sent")
          @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
        else
          flash[:errors] = result.error_message
        end
      end
      flash[:success] = 'Document is submitted to the candidate for signature'
    else
      flash[:errors] = ["Docusign token request failed, please regenerate the token from integrations"]
    end
    redirect_to company_conversations_path(conversation: params[:conversation_id])
  end


  def create
    @conversation = Conversation.where(id: params[:conversation]).first
    if @conversation.job_application.present?
      @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order("created_at desc")
    end
    @favourites = current_user.favourables
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html {
        render 'index'
      }
      format.js
    end
  end


  def search
    if params[:keyword].present? and params[:topic].present?
      @conversations = params[:topic] == "All" ?
                           Conversation.conversation_of(current_company, params[:keyword]) :
                           Conversation.send(params[:topic]).conversation_of(current_company, params[:keyword])
    else
      @conversations = params[:topic] == "All" ?
                           Conversation.all_onversations(online_user) :
                           Conversation.send(params[:topic]).all_onversations(online_user)

    end
    group_ids = Group.user_chat_groups(online_user, current_company).ids
    @conversations = @conversations.select { |con| group_ids.include?(con.chatable_id) }
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
    conversation = Conversation.find(params[:chatconversation])
    if params[:directoryid].present?
      user = current_company.users.where(id: params[:directoryid]).first
    elsif params[:candidateid].present?
      user = current_company.candidates.where(id: params[:candidateid]).first
    elsif params[:contactid].present?
      user = current_company.company_contacts.where(id: params[:contactid]).first
    else
      flash[:error] = "Select any one option."
      redirect_to company_conversations_path(conversation: conversation.id)
      return
    end
    if params[:chatctype] == "Group"
      group = Group.find(params[:chatcid])
      if group.groupables.create(groupable: user)
        flash[:success] = "Member is added to the group"
      else
        flash[:errors] = group.errors.full_messages
      end
    else
      if params[:chatctype] == "Candidate"
        user1 = Candidate.where(id: params[:chatcid]).first
      elsif params[:chatctype] == "Company"
        user1 = Company.where(id: params[:chatcid]).first
      else
        user1 = User.find(params[:chatcid])
      end
      name = current_user.full_name + ", " + user.full_name + ", " + user1.full_name
      group = Group.create(group_name: name, company_id: current_company.id, member_type: "Chat")
      group.groupables.create(groupable: current_user)
      group.groupables.create(groupable: user)
      group.groupables.create(groupable: user1)
      conversation.update(chatable: group, topic: "GroupChat")
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

  private

  def find_mini_chat_user
    params[:utype].constantize.find_by(id: params[:uid])
  end
  def create_or_find_conversation
    @chat_with = find_mini_chat_user
    user_groups = Group.where(member_type: 'Chat').joins(:users).where("groupables.groupable_id = ?",current_user.id).ids
    chat_with_groups = Group.where(member_type: 'Chat').joins(@chat_with.class.to_s.downcase.pluralize.to_sym).where("groupables.groupable_id = ?",@chat_with.id).ids
  end
  def create_one_to_one_conversation
    group = current_company.groups.create(group_name: "#{@chat_with.full_name} #{current_user.full_name}", member_type: 'Chat')
    group.groupables.create(groupable: @chat_with)
    group.groupables.create(groupable: current_user)
    Conversation.OneToOne.create(chatable: group)
  end


  def set_activity_for_job_application
    if @conversation&.job_application.present?
      @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order("created_at desc")
    end
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
    candidate = @conversation.chatable.groupables.where(groupable_type: "Candidate").first.groupable
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
