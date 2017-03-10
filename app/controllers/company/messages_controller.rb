class Company::MessagesController < Company::BaseController
  before_action :find_chat , only:  [:create,:file_message , :render_message,:share_message]
  before_action :find_message  ,only:  [:render_message, :share_message]

  def create
    @message = @chat.messages.new(message_params.merge(messageable_id: current_user.id, messageable_type:current_user.type))
    respond_to  do |format|
      format.js do
        if @message.save
          flash[:success] = "Message sent successfully"
        else
          flash[:errors] = @message.errors.full_messages
        end
      end
    end
  end

  def render_message
    respond_to do |format|
      format.js

    end
  end

  def file_message
    respond_to do |format|
      format.js  do
        @message = @chat.messages.new(messageable_id: current_user.id, messageable_type: current_user.type ,body:"#{current_user.try(:full_name)} uploaded a file with name <a href=#{params[:file_url]} download>#{params[:file_name]}</a>")
        if @message.save()
          flash[:success] = "Message sent successfully"

        else
          flash[:errors] = @message.errors.full_messages
        end
      end
      format.html do
        @company_doc =  current_company.company_docs.find(params[:company_doc_id])
        @attachment = @company_doc.attachment
        @message = @chat.messages.new(messageable_id: current_user.id, messageable_type: current_user.type ,body:"#{current_user.try(:full_name)} uploaded a file with name <a href=#{@attachment.file} download>#{@company_doc.name}</a>")
        if @message.save()
          flash[:success] = "Message sent successfully"

        else
          flash[:errors] = @message.errors.full_messages
        end
        redirect_to :back
      end
    end
  end
  def share_message
    if request.post?
      UserMailer.share_message_email(@message, params[:email] ,params[:note]).deliver
      flash[:success] = "Message Shared Successfully."
      redirect_to :back
    end
  end

  private

  def message_params
    params.require(:message).permit(:body ,:messageable_id ,:messageable_type)
  end

  def find_chat
    @chat = current_user.chats.find( params[:chat_id] || params[:message][:chat_id] ) || []
  end

  def find_message
    @message = @chat.messages.find(params[:id] || params[:message_id]) || []
  end

end
