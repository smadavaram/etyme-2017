class ConversationMessagesController < ApplicationController
  before_action :set_conversation
  # skip_before_action :authenticate_user!, only: :mark_as_read

  def create
    message = ConversationMessage.new(message_params.merge({conversation_id: @conversation.id}))
    message.userable = get_current_user
    if message.save
      # if @conversation.chatable_type == "Group"
      @conversation.chatable.groupables.each do |gm|
        ActionCable.server.broadcast "Message_#{gm.groupable_type}_#{gm.groupable_id}",
                                     msg_id: message.id,
                                     # msg: message_content,
                                     msg: message.body,
                                     img_alt: "#{message.userable.first_name[0]&.capitalize || 'N'}.#{message.userable.last_name[0]&.capitalize || 'A'}",
                                     sender_name: message.userable.full_name.capitalize,
                                     file_url: message.file_url ? message.file_url : "",
                                     msg_url: message.userable.photo,
                                     msg_time: message.created_at.strftime("%l:%M%P"),
                                     # msg_att: message.attachment_file,
                                     # msg_att_name: message.file_name,
                                     usr_typ: message.userable.class.to_s,
                                     usr: message.userable.id,
                                     recpt_type: gm.groupable_type,
                                     recpt_id: gm.groupable_id,
                                     unread_msg_cnt: 0, # Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                     con_id: @conversation.id,
                                     chat_typ: "Group",
                                     grp_id: @conversation.chatable.id,
                                     dom: "#conversation_#{@conversation.id}"
      end
    end
    head :ok
  end

  def mark_as_read
    if params[:chat_type] == "Group"
      GroupMsgNotify.where(conversation_message_id: params[:id], group_id: params[:group_id],
                           member_type: params[:cnt_user_type], member_id: params[:cnt_user_id]).update_all(is_read: true)
    else
      ConversationMessage.where(conversation_id: params[:conversation_id], id: params[:id]).update_all(is_read: true)
    end
    render json: :ok
  end

  def messages
    @prev_date = params[:prev_date] ||= nil
    @messages = @conversation.conversation_messages.order(created_at: :desc).paginate(page: params[:page], per_page: 10) if @conversation.present?
  end

  def pop_messages
    @prev_date = params[:prev_date] ||= nil
    @messages = @conversation.conversation_messages.order(created_at: :desc).paginate(page: params[:page], per_page: 10)
  end

  private

  def set_conversation
    @conversation = Conversation.where(id: params[:conversation_id]).first
  end

  def message_params
    params.require(:conversation_message).permit(:body, :attachment_file, :file_name, :file_size, :file_type, :file_url)
  end

  def render_message(message)
    self.render(partial: 'conversation_messages/conversation_message', locals: {message: message})
  end

  def get_current_user
    if current_user.present?
      current_user
    elsif current_candidate.present?
      current_candidate
    end
  end

end