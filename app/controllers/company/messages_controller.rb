class Company::MessagesController < Company::BaseController
  before_action :find_chat , only:  [:create,:file_message]

  def create
    @message = @chat.messages.new(message_params.merge(messageable_id: current_user.id, messageable_type:current_user.type))
    if @message.save()
      flash[:success] = "message created successfully"
    else
      flash[:errors] = @message.errors.full_messages
    end
    redirect_to :back
  end
  def file_message
    @message = @chat.messages.new(messageable_id: current_user.id, messageable_type: current_user.type ,body:"#{current_user.try(:full_name)} uploaded a file with name <a href=#{params[:file_url]} download>#{params[:file_name]}</a>")
      if @message.save()
        flash[:success] = "message created successfully"

      else
        flash[:success] = "message created successfully"
      end
    render json: @message
  end

  private

  def message_params
    params.require(:message).permit(:body ,:messageable_id ,:messageable_type)
  end
  def find_chat
    @chat = current_user.chats.find( params[:chat_id] || params[:message][:chat_id] )
  end
end
