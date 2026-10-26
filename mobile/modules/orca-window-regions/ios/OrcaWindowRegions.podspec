Pod::Spec.new do |s|
  s.name = 'OrcaWindowRegions'
  s.version = '0.0.1'
  s.summary = 'Reports the window regions a foldable divides at its hinge and occludes with its status column'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Orca'
  s.homepage = 'https://onorca.dev'
  s.source = { :git => 'https://github.com/stablyai/orca.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
