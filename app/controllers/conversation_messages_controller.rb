class ConversationMessagesController < ApplicationController
  before_action :set_conversation
  # skip_before_action :authenticate_user!, only: :mark_as_read

  def create
    message = ConversationMessage.new(message_params.merge({conversation_id: @conversation.id}))
    message.userable = get_current_user
    if message.save
      # message_content = render_message(message)

      if @conversation.chatable_type == "Group"
        @conversation.chatable.groupables.each do |gm|
          # GroupMsgNotify.create(group_id: @conversation.chatable.id, member: gm.groupable, conversation_message: message)
          ActionCable.server.broadcast "Message_#{gm.groupable_type}_#{gm.groupable_id}",
                                       msg_id: message.id,
                                       # msg: message_content,
                                       msg: message.body,
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
        @conversation.chatable.company.users.each do |usr|
          # GroupMsgNotify.create(group_id: @conversation.chatable.id, member: usr, conversation_message: message)
          ActionCable.server.broadcast "Message_#{usr.class}_#{usr.id}",
                                       msg_id: message.id,
                                       # msg: message_content,
                                       msg: message.body,
                                       msg_url: message.userable.photo,
                                       msg_time: message.created_at.strftime("%l:%M%P"),
                                       # msg_att: message.attachment_file,
                                       # msg_att_name: message.file_name,
                                       usr_typ: message.userable.class.to_s,
                                       usr: message.userable.id,
                                       recpt_type: usr.class.to_s,
                                       recpt_id: usr.id,
                                       unread_msg_cnt: 0, # Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                       con_id: @conversation.id,
                                       chat_typ: "Group",
                                       grp_id: @conversation.chatable.id,
                                       dom: "#conversation_#{@conversation.id}"
        end
      else
        recipient = (@conversation.recipientable == get_current_user ? @conversation.senderable : @conversation.recipientable )
        ActionCable.server.broadcast "Message_#{recipient.class.to_s}_#{recipient.id}",
                                     msg_id: message.id,
                                     # msg: message_content,
                                     msg: message.body,
                                     msg_url: message.userable.photo,
                                     msg_time: message.created_at.strftime("%l:%M%P"),
                                     # msg_att: message.attachment_file,
                                     # msg_att_name: message.file_name,
                                     usr_typ: message.userable.class.to_s,
                                     usr: message.userable.id,
                                     recpt_type: recipient.class.to_s,
                                     recpt_id: recipient.id,
                                     unread_msg_cnt: 0, #Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                     con_id: @conversation.id,
                                     chat_typ: "OneToOne",
                                     dom: "#conversation_#{@conversation.id}"

        ActionCable.server.broadcast "Message_#{get_current_user.class.to_s}_#{get_current_user.id}",
                                     msg_id: message.id,
                                     # msg: message_content,
                                     msg: message.body,
                                     msg_url: message.userable.photo,
                                     msg_time: message.created_at.strftime("%l:%M%P"),
                                     # msg_att: message.attachment_file,
                                     # msg_att_name: message.file_name,
                                     usr_typ: message.userable.class.to_s,
                                     usr: message.userable.id,
                                     recpt_type: recipient.class.to_s,
                                     recpt_id: recipient.id,
                                     unread_msg_cnt: 0, # Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", recipient.class.to_s, recipient.id, recipient.class.to_s, recipient.id).where.not(conversation_messages: {is_read: true, userable: recipient}).uniq.count,
                                     con_id: @conversation.id,
                                     chat_typ: "OneToOne",
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
    @prev_date = params[:prev_date]||=nil
    @messages = @conversation.conversation_messages.order(created_at: :desc).paginate(page: params[:page], per_page: 5)
  end

  private

  def set_conversation
    @conversation = Conversation.find(params[:conversation_id])
  end

  def message_params
    params.require(:conversation_message).permit(:body, :attachment_file, :file_name, :file_size, :file_type)
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