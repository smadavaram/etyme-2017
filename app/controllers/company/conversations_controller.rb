class Company::ConversationsController < Company::BaseController

  skip_before_action :authenticate_user!, only: :search

  def index
    get_conversation_users
    message = ConversationMessage.joins(:conversation).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(is_read: true, userable: current_user).order("created_at DESC").first
    if params[:conversation].present?
      @conversation = Conversation.find(params[:conversation])
    elsif message.present?
      # set_conversation(message.userable)
      set_conversation(message.userable, '', message.userable_id, message.userable_type)
      @current_chat = message.userable
      # @messages = @conversation.conversation_messages.last(50)
    elsif @candidates.present?
      # set_conversation(@candidates.first)
      set_conversation(@candidates.first, '', @candidates.first.id, @candidates.first.class.to_s)
      @current_chat = @candidates.first
      # @messages = @conversation.conversation_messages.last(50)
    end
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
  end

  def create
    if params[:chatable_type] == "Group"
      user = Group.where(id: params[:chatable_id]).first
    elsif params[:user_type] == "Candidate"
      user = Candidate.where(id: params[:user_id]).first
    elsif params[:user_type] == "Company"
      user = Company.where(id: params[:user_id]).first
    else
      user = User.where(id: params[:user_id]).first
    end
    set_conversation(user, params[:chat_topic], params[:chatable_id], params[:chatable_type])
    # if params[:user_type] == "Candidate"
    #   user = Candidate.where(id: params[:user_id]).first
    # else
    #   user = User.where(id: params[:user_id]).first
    # end
    #
    # set_conversation(user)
    # @messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html {
        get_conversation_users
        render 'index'
      }
      format.js
    end
  end

  def search
    @candidates = Candidate.like_any([:first_name, :last_name], params[:keyword].to_s.split)
    @companies = User.joins(:company).where("companies.name ILIKE ?", "%#{params[:keyword].to_s}%")
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
    user = User.find(params[:user])
    conversation = Conversation.find(params[:chatconversation])
    if params[:chatctype] == "Group"
      group = Group.find(params[:chatcid])
      group.groupables.create(groupable: user)
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
    redirect_to company_conversations_path(conversation: conversation.id)
  end

  private

  # def set_conversation(user)
  #   ConversationMessage.unread_messages(user, current_user).update_all(is_read: true)
  #   if Conversation.between(current_user, user).present?
  #     @conversation = Conversation.between(current_user, user).first
  #   else
  #     @conversation = Conversation.create!({senderable: current_user, recipientable: user})
  #   end
  # end

  def set_conversation(user, chat_topic, chatable_id, chatable_type)
    if chat_topic == "Group"
      GroupMsgNotify.where(group_id: user.id, member_type: current_user.class.to_s, member_id: current_user.id).update_all(is_read: true)
      if Conversation.where(chatable: user, topic: "GroupChat").present?
        @conversation = Conversation.where(chatable: user, topic: "GroupChat").first
      else
        @conversation = Conversation.create!({chatable: user, topic: "GroupChat"})
      end
    else
      ConversationMessage.unread_messages(user, current_user).where(conversations: {chatable_id: chatable_id, chatable_type: chatable_type}).update_all(is_read: true)
      if Conversation.between(current_user, user).where(chatable_id: chatable_id, chatable_type: chatable_type).present?
        @conversation = Conversation.between(current_user, user).where(chatable_id: chatable_id, chatable_type: chatable_type).first
      else
        @conversation = Conversation.create!({senderable: current_user, recipientable: user, chatable_id: chatable_id, chatable_type: chatable_type})
      end
    end
  end

  def get_conversation_users
    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type = 'Candidate')", "User", current_user.id, "User", current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @candidates = Candidate.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type != 'Candidate')", "User", current_user.id, "User", current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @companies = User.where.not(id: current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    @favourites = current_user.favourables

    @groups = current_user.groups
  end

end
