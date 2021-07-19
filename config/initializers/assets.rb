# frozen_string_literal: true

# Be sure to restart your server when you modify this file.

# Version of your assets, change this if you want to expire all your assets.
Rails.application.config.assets.version = '1.0'

# Add additional assets to the asset load path.
# Rails.application.config.assets.paths << Emoji.images_path
# Add Yarn node_modules folder to the asset load path.
Rails.application.config.assets.paths << Rails.root.join('node_modules')
Rails.application.config.assets.paths << Rails.root.join("app", "assets", "fonts")

# Precompile additional assets.
# application.js, application.css, and all non-JS/CSS in the app/assets
# folder are already added.
# Rails.application.config.assets.precompile += %w( admin.js admin.css )
Rails.application.config.assets.precompile += %w[company.js]
Rails.application.config.assets.precompile += %w[company.css]
Rails.application.config.assets.precompile += %w[plugin/pace/pace.min.js]
Rails.application.config.assets.precompile += %w[candidate.css]
Rails.application.config.assets.precompile += %w[candidate.js]
Rails.application.config.assets.precompile += %w[chats.css]
Rails.application.config.assets.precompile += %w[resume.css]
Rails.application.config.assets.precompile += %w[resume.js]
Rails.application.config.assets.precompile += %w[static.css]
Rails.application.config.assets.precompile += %w[static.js]
Rails.application.config.assets.precompile += %w[libs/jquery-2.1.1.min.js]
Rails.application.config.assets.precompile += %w[home.scss]
Rails.application.config.assets.precompile += %w[home.js]
Rails.application.config.assets.precompile += %w[company_account.css]
Rails.application.config.assets.precompile += %w[kulkakit.css]
Rails.application.config.assets.precompile += %w[kulkakit.js]
Rails.application.config.assets.precompile += %w[webflow.css]
Rails.application.config.assets.precompile += %w[webflow.js]
Rails.application.config.assets.precompile << /\.(?:svg|eot|woff|ttf)$/

# Needed for BulletTrain, since it uses helpers in scss.erb files
Rails.application.config.assets.configure do |env|
  env.context_class.class_eval do
    include BullettrainHelper
  end
end

Rails.application.config.assets.precompile += %w[
  shared/hide_show_toggler.js
  shared/domain_checker.js
  shared/flash_manager.js
]
