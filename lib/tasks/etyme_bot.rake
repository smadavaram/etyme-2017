desc 'Task for Etymebot recruiter creation'
namespace :etymebot_recruiter do
  task user: :environment do
    user = User.find_by(email: 'bot@etyme.com') || User.create(user_params)
  end

  private

  def user_params
    {
      first_name: 'Etyme',
      last_name: 'bot',
      email: 'bot@etyme.com',
      type: 'Admin',
      password: 'etymebot12',
      password_confirmation: 'etymebot12',
      confirmed_at: DateTime.now
    }
  end
end
