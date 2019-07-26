class Candidate::ConversationsController < Candidate::BaseController

  def index
    @conversations = Conversation.all_onversations(current_candidate).uniq
    @conversation = params[:conversation].present? ? Conversation.find(params[:conversation]) : @conversations.first
    @favourites = current_candidate.favourables.uniq
    set_activity_for_job_application
  end

  def create
    @conversation = Conversation.where(id: params[:conversation]).first
    if @conversation.job_application.present?
      @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order("created_at desc")
    end
    @favourites = current_candidate.favourables
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html {
        render 'index'
      }
      format.js
    end
  end

  def add_to_favourite
    @favourite = current_candidate.favourables.create(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id])
  end

  def remove_from_favourite
    favourable = current_candidate.favourables.where(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id]).first
    @user = favourable.favourabled if favourable.present?
    favourable.destroy if favourable.present?
  end

  def mute
    conversation = Conversation.find(params[:id])
    ConversationMute.create(conversation: conversation, mutable: current_candidate)
    redirect_to candidate_conversations_path(conversation: conversation.id)
  end

  def unmute
    conversation = Conversation.find(params[:id])
    ConversationMute.where(conversation: conversation, mutable: current_candidate).destroy_all
    redirect_to candidate_conversations_path(conversation: conversation.id)
  end

  def leave_group
    grp = Group.find(params[:group])
    grp.groupables.where(groupable: current_candidate).destroy_all
    redirect_to candidate_conversations_path
  end

  private

  # def set_conversation(user)
  #   ConversationMessage.unread_messages(user, current_candidate).update_all(is_read: true)
  #   if Conversation.between(current_candidate, user).present?
  #     @conversation = Conversation.between(current_candidate, user).first
  #   else
  #     @conversation = Conversation.create!({senderable: current_candidate, recipientable: user})
  #   end
  # end

  def set_conversation(user, chat_topic, chatable_id, chatable_type)
    if chat_topic == "Group"
      GroupMsgNotify.where(group_id: user.id, member_type: current_candidate.class.to_s, member_id: current_candidate.id).update_all(is_read: true)
      if Conversation.where(chatable: user, topic: "GroupChat").present?
        @conversation = Conversation.where(chatable: user, topic: "GroupChat").first
      else
        @conversation = Conversation.create!({chatable: user, topic: "GroupChat"})
      end
    else
      ConversationMessage.unread_messages(user, current_candidate).where(conversations: {chatable_id: chatable_id, chatable_type: chatable_type}).update_all(is_read: true)
      if Conversation.between(current_candidate, user).where(chatable_id: chatable_id, chatable_type: chatable_type).present?
        @conversation = Conversation.between(current_candidate, user).where(chatable_id: chatable_id, chatable_type: chatable_type).first
      else
        @conversation = Conversation.find_by(recipientable_id: current_candidate.id, senderable_id: user.id)
        # @conversation ||= Conversation.create!({senderable: current_candidate, recipientable: user, chatable_id: chatable_id, chatable_type: chatable_type})
      end
    end
  end

  def get_conversation_users
    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type = 'Candidate')", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).pluck(:senderable_id, :recipientable_id).flatten
    @candidates = Candidate.where.not(id: current_candidate.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type != 'Candidate')", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).pluck(:senderable_id, :recipientable_id).flatten
    @companies = User.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    @favourites = current_candidate.favourables

    @groups = current_candidate.groups
  end


  def set_activity_for_job_application
    if @conversation.job_application.present?
      @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order("created_at desc")
    end
  end

end