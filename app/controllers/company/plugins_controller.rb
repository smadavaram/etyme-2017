class Company::PluginsController < Company::BaseController

  def create
    @plugin = current_company.plugins.new(plugin_attributes.merge(plugin_type: :skype))
    if @plugin.save
      flash[:success] = 'Skype Credentials are saved successfully'
    else
      flash[:errors] = @plugin.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end


  private

  def plugin_attributes
    {
        user_name: current_user.full_name,
        app_secret: params[:app_secret],
        app_key: params[:app_key]
    }
  end

end