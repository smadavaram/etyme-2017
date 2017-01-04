class Company::CommentsController < ApplicationController

  def create
    @comment = current_user.comments.new(comments_params)
    if @comment.save
      flash[:success] = ""
    else
      flash.now[:errors] = @comment.errors.full_messages
    end
    redirect_to :back
  end

  private

    def comments_params
      params.require(:comment).permit(:body,:commentable_id,:commentable_type)
    end

end
